package expo.modules.onefmvoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Collections
import java.util.LinkedHashMap
import java.util.concurrent.Executors

/**
 * On-device text to speech with sherpa-onnx (VITS models: Piper, Mimic3, Coqui, MMS).
 * Same design as the SHEETMD sheet-tts module: the model is a .tar.bz2 downloaded by JS,
 * extracted here, then streamed straight into an AudioTrack while it is generated.
 */
class OneFmVoiceModule : Module() {
  private var tts: OfflineTts? = null
  private val playExecutor = Executors.newSingleThreadExecutor()
  // sherpa's OfflineTts must not generate from two threads at once
  private val genLock = Any()

  @Volatile private var activeId: Int = -1
  @Volatile private var cancelled: Boolean = false
  @Volatile private var currentAudioTrack: AudioTrack? = null
  private var audioFocusRequest: Any? = null

  private fun requestAudioFocus() {
    val ctx = appContext.reactContext?.applicationContext ?: return
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .setAcceptsDelayedFocusGain(false)
          .setOnAudioFocusChangeListener { }
          .build()
        audioFocusRequest = req
        am.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      }
    } catch (e: Exception) { }
  }

  private fun abandonAudioFocus() {
    val ctx = appContext.reactContext?.applicationContext ?: return
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        (audioFocusRequest as? AudioFocusRequest)?.let { am.abandonAudioFocusRequest(it) }
        audioFocusRequest = null
      } else {
        @Suppress("DEPRECATION")
        am.abandonAudioFocus(null)
      }
    } catch (e: Exception) { }
  }

  private class Found(val model: File?, val tokens: File?, val dataDir: File?, val lexicon: File?)

  // The archive may wrap everything in one folder, so look in the folder and one level below.
  // espeak-ng-data and lexicon.txt are optional: Piper and Mimic3 have espeak data, MMS has neither.
  private fun findFiles(baseDir: File): Found {
    var model: File? = null
    var tokens: File? = null
    var dataDir: File? = null
    var lexicon: File? = null
    fun inspect(dir: File) {
      val list = dir.listFiles() ?: return
      for (f in list) {
        if (f.isFile && f.name.endsWith(".onnx")) { if (model == null) model = f }
        else if (f.isFile && f.name == "tokens.txt") tokens = f
        else if (f.isFile && f.name == "lexicon.txt") lexicon = f
        else if (f.isDirectory && f.name == "espeak-ng-data") dataDir = f
      }
    }
    inspect(baseDir)
    if (model == null || tokens == null) {
      baseDir.listFiles()?.filter { it.isDirectory && it.name != "espeak-ng-data" }?.forEach { inspect(it) }
    }
    return Found(model, tokens, dataDir, lexicon)
  }

  private fun releaseModel() {
    synchronized(this) {
      try { tts?.release() } catch (e: Exception) { }
      tts = null
    }
  }

  private fun stopPlayback() {
    val prevId = activeId
    activeId = -1
    cancelled = true
    currentAudioTrack?.let { track ->
      try { track.pause(); track.flush(); track.stop() } catch (e: Exception) { }
    }
    if (prevId != -1) sendEvent("onStopped", mapOf("id" to prevId))
    abandonAudioFocus()
  }

  // ---- Replays: a message that was spoken once is kept in memory (already levelled), so it starts at 0.0 s again ----
  // Nothing is saved to disk: a bad saved file can never replay silence.
  private val memCache = Collections.synchronizedMap(
    object : LinkedHashMap<String, Pair<FloatArray, Int>>(8, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<FloatArray, Int>>?): Boolean = size > 8
    }
  )

  private class Leveled(val rawPeak: Float, val peak: Float, val rms: Double, val dc: Float, val bad: Int)

  // Cleans and levels one finished message in place: NaN removed, constant offset (DC) removed, quiet voices lifted so that
  // the loud end sits near 0.5, and anything above 0.8 is rounded off softly instead of being cut flat.
  private fun levelAudio(a: FloatArray): Leveled {
    var bad = 0
    var sum = 0.0
    for (i in a.indices) {
      val v = a[i]
      if (v.isNaN() || v.isInfinite()) { a[i] = 0f; bad++ } else sum += v
    }
    val dc = (sum / maxOf(a.size, 1)).toFloat()
    var raw = 0f
    for (v in a) { val av = if (v < 0f) -v else v; if (av > raw) raw = av }
    if (kotlin.math.abs(dc) > 0.0003f) for (i in a.indices) a[i] = a[i] - dc
    val mags = FloatArray(a.size)
    for (i in a.indices) mags[i] = if (a[i] < 0f) -a[i] else a[i]
    java.util.Arrays.sort(mags)
    val level = if (mags.isEmpty()) 0f else mags[(mags.size * 0.999).toInt().coerceAtMost(mags.size - 1)]
    val g = if (level >= 0.002f && level < 0.5f) (0.5f / level).coerceAtMost(40f) else 1f
    var peak = 0f
    var sq = 0.0
    for (i in a.indices) {
      val y = a[i] * g
      val ay = if (y < 0f) -y else y
      val o = if (ay <= 0.8f) y else (if (y < 0f) -1f else 1f) * (0.8f + 0.2f * Math.tanh(((ay - 0.8f) / 0.2f).toDouble()).toFloat())
      a[i] = o
      val ao = if (o < 0f) -o else o
      if (ao > peak) peak = ao
      sq += (o * o).toDouble()
    }
    return Leveled(raw, peak, Math.sqrt(sq / maxOf(a.size, 1)), dc, bad)
  }

  private fun buildTrack(sampleRate: Int): AudioTrack {
    val minBuf = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
    // 20 s of buffer so generation can run ahead of playback
    val bufSize = maxOf(minBuf, sampleRate * 4 * 20)
    val built = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      )
      .setBufferSizeInBytes(bufSize)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    return built
  }

  // Some models hand over the whole text as one block, so the voice would stay silent until everything is
  // generated. Cutting the text into short sentences here makes the first audio ready after the first one.
  private fun splitText(text: String): List<String> {
    val sentences = text.trim().split(Regex("(?<=[.\u0964?!])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
    val pieces = ArrayList<String>()
    for (sentence in sentences) {
      if (sentence.length <= 100) { pieces.add(sentence); continue }
      var cur = StringBuilder()
      for (part in sentence.split(Regex("(?<=,)\\s+"))) {
        if (cur.isNotEmpty() && cur.length + part.length > 80) {
          pieces.add(cur.toString().trim())
          cur = StringBuilder()
        }
        if (cur.isNotEmpty()) cur.append(' ')
        cur.append(part)
      }
      if (cur.isNotEmpty()) pieces.add(cur.toString().trim())
    }
    val out = ArrayList<String>()
    var carry = ""
    for (piece in pieces) {
      val joined = if (carry.isEmpty()) piece else "$carry $piece"
      if (joined.length < 20) { carry = joined } else { out.add(joined); carry = "" }
    }
    if (carry.isNotEmpty()) {
      if (out.isNotEmpty()) out[out.size - 1] = out[out.size - 1] + " " + carry else out.add(carry)
    }
    if (out.isEmpty()) return listOf(text)
    // A short first piece: the first sound is ready after about 2 to 3 seconds of generating.
    val first = out[0]
    if (first.length > 40) {
      val cut = first.lastIndexOf(' ', 36)
      if (cut >= 16) { out[0] = first.substring(0, cut).trim(); out.add(1, first.substring(cut + 1).trim()) }
    }
    return out
  }

  private fun readFully(input: BufferedInputStream, buf: ByteArray): Int {
    var got = 0
    while (got < buf.size) {
      val r = input.read(buf, got, buf.size - got)
      if (r < 0) break
      got += r
    }
    return got
  }

  override fun definition() = ModuleDefinition {
    Name("OneFmVoice")
    Events("onStart", "onDone", "onStopped", "onError", "onInfo")

    OnDestroy {
      stopPlayback()
      releaseModel()
      playExecutor.shutdownNow()
    }

    // Loads a model folder. Returns false when files are missing or the model cannot start.
    AsyncFunction("init") { modelDir: String ->
      try {
        stopPlayback()
        releaseModel()
        val dir = File(modelDir)
        if (!dir.exists() || !dir.isDirectory) return@AsyncFunction false
        val f = findFiles(dir)
        if (f.model == null || f.tokens == null) return@AsyncFunction false
        val vits = OfflineTtsVitsModelConfig(
          model = f.model.absolutePath,
          tokens = f.tokens.absolutePath,
          lexicon = f.lexicon?.absolutePath ?: "",
          dataDir = f.dataDir?.absolutePath ?: "",
          lengthScale = 1.0f
        )
        val modelConfig = OfflineTtsModelConfig(vits = vits, numThreads = 4, provider = "cpu", debug = false)
        val newTts = OfflineTts(config = OfflineTtsConfig(model = modelConfig))
        synchronized(this@OneFmVoiceModule) { tts = newTts }
        true
      } catch (e: Throwable) {
        releaseModel()
        false
      }
    }

    Function("isReady") { tts != null }

    Function("release") {
      stopPlayback()
      releaseModel()
    }

    Function("stop") { stopPlayback() }

    Function("hasCache") { key: String -> key.isNotEmpty() && memCache.containsKey(key) }

    // Speaks one text. The whole text is generated first (sentence by sentence), levelled once, then played from the start
    // in one go. A text that was spoken before starts at once from memory.
    Function("speak") { id: Int, text: String, speed: Float, sid: Int, cacheKey: String ->
      val memKey = if (cacheKey.isEmpty()) "" else "$cacheKey:$sid:$speed"
      val memHit = if (memKey.isNotEmpty()) memCache[memKey] else null
      val currentTts = tts
      if (currentTts == null && memHit == null) {
        sendEvent("onError", mapOf("id" to id, "message" to "Voice model is not loaded"))
        return@Function
      }
      if (activeId != -1) {
        val prevId = activeId
        activeId = -1
        cancelled = true
        currentAudioTrack?.let { track ->
          try { track.pause(); track.flush(); track.stop() } catch (e: Exception) { }
        }
        sendEvent("onStopped", mapOf("id" to prevId))
      }

      playExecutor.submit {
        activeId = id
        cancelled = false
        var track: AudioTrack? = null
        var started = false
        var totalFrames = 0
        var peak = 0f
        try {
          requestAudioFocus()
          val mediaVolume = try {
            (appContext.reactContext?.applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 1
          } catch (e: Exception) { 1 }

          var audio: FloatArray? = memHit?.first
          var sr: Int = memHit?.second ?: 0
          var rawPeak = 0f
          var rms = 0.0
          var dc = 0f
          var bad = 0
          var genMs = 0L

          if (audio == null && currentTts != null) {
            // ---- Generate the whole text first ----
            sr = currentTts.sampleRate()
            val t0 = System.currentTimeMillis()
            val chunks = splitText(text)
            val parts = ArrayList<FloatArray>()
            val gap = FloatArray(sr * 12 / 100) // 120 ms of silence between sentences
            synchronized(genLock) {
              for ((ci, chunk) in chunks.withIndex()) {
                if (cancelled || activeId != id) break
                if (ci > 0) parts.add(gap)
                currentTts.generateWithCallback(chunk, sid = sid, speed = speed, callback = { samples ->
                  if (cancelled || activeId != id) {
                    0
                  } else {
                    if (samples.isNotEmpty()) parts.add(samples.copyOf())
                    1
                  }
                })
              }
            }
            genMs = System.currentTimeMillis() - t0
            if (!cancelled && activeId == id) {
              var total = 0
              for (c in parts) total += c.size
              if (total > 0) {
                val all = FloatArray(total)
                var o = 0
                for (c in parts) { System.arraycopy(c, 0, all, o, c.size); o += c.size }
                val lv = levelAudio(all)
                rawPeak = lv.rawPeak; peak = lv.peak; rms = lv.rms; dc = lv.dc; bad = lv.bad
                audio = all
                if (memKey.isNotEmpty() && lv.peak >= 0.01f) memCache[memKey] = Pair(all, sr)
              }
            }
          } else if (audio != null) {
            for (v in audio) { val av = if (v < 0f) -v else v; if (av > peak) peak = av }
            rawPeak = peak
          }

          // ---- Play it from the start ----
          val out = audio
          if (!cancelled && activeId == id && out != null && out.isNotEmpty() && sr > 0) {
            val t = buildTrack(sr)
            track = t
            currentAudioTrack = t
            started = true
            sendEvent("onStart", mapOf("id" to id))
            try { t.setVolume(1.0f) } catch (e: Exception) { }
            t.play()
            var pos = 0
            while (!cancelled && activeId == id && pos < out.size) {
              val n = minOf(8192, out.size - pos)
              t.write(out, pos, n, AudioTrack.WRITE_BLOCKING)
              pos += n
              totalFrames += n
            }
            if (!cancelled && activeId == id) {
              sendEvent("onInfo", mapOf(
                "id" to id,
                "gen" to genMs.toInt(),
                "audio" to (totalFrames.toDouble() / sr),
                "raw" to rawPeak.toDouble(),
                "peak" to peak.toDouble(),
                "rms" to rms,
                "dc" to dc.toDouble()
              ))
            }
          }

          // Wait until everything written has been played. Give up if the position stops moving for 4 s.
          val t = track
          if (t != null && started && !cancelled && activeId == id) {
            var lastHead = -1
            var lastMove = System.currentTimeMillis()
            while (!cancelled && activeId == id) {
              val head = t.playbackHeadPosition
              if (head >= totalFrames) break
              val now = System.currentTimeMillis()
              if (head != lastHead) { lastHead = head; lastMove = now }
              else if (now - lastMove > 4000) break
              Thread.sleep(15)
            }
          }

          if (!cancelled && activeId == id) {
            val silent = started && totalFrames > 0 && peak < 0.01f
            if (!started) sendEvent("onError", mapOf("id" to id, "message" to "The voice produced no audio. The text may contain letters this voice cannot read."))
            else if (silent && mediaVolume == 0) sendEvent("onError", mapOf("id" to id, "message" to "Media volume is 0. Turn the phone's media volume up."))
            else if (silent) sendEvent("onError", mapOf("id" to id, "message" to String.format("The voice made no sound (loudest sample %.4f, %d bad samples, %d Hz). Try another voice in Profile.", peak, bad, sr)))
            else sendEvent("onDone", mapOf("id" to id))
          }
        } catch (e: Throwable) {
          if (!cancelled && activeId == id) {
            sendEvent("onError", mapOf("id" to id, "message" to (e.message ?: "Playback failed")))
          }
        } finally {
          try { track?.stop(); track?.release() } catch (e: Exception) { }
          if (currentAudioTrack === track) currentAudioTrack = null
          abandonAudioFocus()
          if (activeId == id) activeId = -1
        }
      }
    }

    // Extracts a .tar.bz2 model into destDir. Returns true only if a usable model is inside.
    AsyncFunction("extractTarBz2") { archivePath: String, destDir: String ->
      try {
        val archiveFile = File(archivePath)
        if (!archiveFile.exists()) return@AsyncFunction false
        val targetDir = File(destDir)
        val tempDir = File(targetDir.parentFile, targetDir.name + "_tmp_" + System.currentTimeMillis())
        if (tempDir.exists()) tempDir.deleteRecursively()
        tempDir.mkdirs()

        FileInputStream(archiveFile).use { fis ->
          BufferedInputStream(fis).use { bis ->
            BZip2CompressorInputStream(bis).use { bz2 ->
              TarArchiveInputStream(bz2).use { tar ->
                var entry: TarArchiveEntry? = tar.nextTarEntry
                while (entry != null) {
                  val name = entry.name
                  if (name.contains("..") || name.startsWith("/")) throw SecurityException("Bad path in archive: $name")
                  val outFile = File(tempDir, name)
                  if (entry.isDirectory) {
                    outFile.mkdirs()
                  } else {
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { fos -> tar.copyTo(fos) }
                  }
                  entry = tar.nextTarEntry
                }
              }
            }
          }
        }

        // Archives wrap everything in one folder (vits-piper-.../). Move its content up.
        val subs = tempDir.listFiles() ?: emptyArray()
        if (subs.size == 1 && subs[0].isDirectory) {
          val inner = subs[0]
          for (f in inner.listFiles() ?: emptyArray()) {
            val dest = File(tempDir, f.name)
            if (dest.exists()) dest.deleteRecursively()
            f.renameTo(dest)
          }
          inner.delete()
        }

        if (targetDir.exists()) targetDir.deleteRecursively()
        if (!tempDir.renameTo(targetDir)) {
          targetDir.mkdirs()
          tempDir.copyRecursively(targetDir, overwrite = true)
          tempDir.deleteRecursively()
        }
        val f = findFiles(targetDir)
        f.model != null && f.tokens != null
      } catch (e: Exception) {
        false
      }
    }
  }
}
