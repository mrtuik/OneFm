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

  // ---- Audio cache: every message is generated once, then replays start at 0.0 s from a file ----
  // File format: 4 bytes sample rate (little endian), then 16-bit little endian mono samples.
  private fun cacheDir(): File? {
    val ctx = appContext.reactContext?.applicationContext ?: return null
    val dir = File(ctx.cacheDir, "onefm-voice-cache")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun cacheFile(key: String): File? {
    if (key.isEmpty()) return null
    val dir = cacheDir() ?: return null
    return File(dir, key.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".pcm")
  }

  private fun pruneCache() {
    val dir = cacheDir() ?: return
    val files = dir.listFiles()?.filter { it.isFile }?.sortedBy { it.lastModified() } ?: return
    var total = files.sumOf { it.length() }
    for (f in files) {
      if (total <= 100L * 1024 * 1024) break
      total -= f.length()
      f.delete()
    }
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
    if (first.length > 50) {
      val cut = first.lastIndexOf(' ', 45)
      if (cut >= 20) { out[0] = first.substring(0, cut).trim(); out.add(1, first.substring(cut + 1).trim()) }
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
    Events("onStart", "onDone", "onStopped", "onError")

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

    Function("hasCache") { key: String ->
      val f = cacheFile(key)
      f != null && f.exists() && f.length() > 8
    }

    // Plays one text. A cached message starts at once from its file. Otherwise it is generated sentence by
    // sentence, played while it is generated, and saved so the next play is instant.
    Function("speak") { id: Int, text: String, speed: Float, sid: Int, cacheKey: String ->
      val cache = cacheFile(cacheKey)
      val cached = cache != null && cache.exists() && cache.length() > 8
      val currentTts = tts
      if (currentTts == null && !cached) {
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
        var out: BufferedOutputStream? = null
        var tmp: File? = null
        var saved = false
        try {
          requestAudioFocus()
          var totalFrames = 0
          // Loudest sample and bad samples of this message. All-quiet audio means the voice made no sound.
          var peak = 0f
          var badSamples = 0
          var sampleRateUsed = 0
          val mediaVolume = try {
            (appContext.reactContext?.applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 1
          } catch (e: Exception) { 1 }

          fun begin() {
            val t = track
            if (t != null && !started) {
              started = true
              sendEvent("onStart", mapOf("id" to id))
              try { t.setVolume(1.0f) } catch (e: Exception) { }
              t.play()
            }
          }

          if (cached && cache != null) {
            // ---- Replay from the saved file: no generation, starts at 0.0 s ----
            val input = BufferedInputStream(FileInputStream(cache))
            try {
              val hdr = ByteArray(4)
              readFully(input, hdr)
              val sr = ByteBuffer.wrap(hdr).order(ByteOrder.LITTLE_ENDIAN).getInt()
              sampleRateUsed = sr
              val t = buildTrack(sr)
              track = t
              currentAudioTrack = t
              val bytes = ByteArray(16384)
              val floats = FloatArray(8192)
              while (!cancelled && activeId == id) {
                val n = readFully(input, bytes)
                val count = n / 2
                if (count <= 0) break
                val bb = ByteBuffer.wrap(bytes, 0, count * 2).order(ByteOrder.LITTLE_ENDIAN)
                for (i in 0 until count) {
                  val fv = bb.getShort() / 32768f
                  floats[i] = fv
                  val av = if (fv < 0f) -fv else fv
                  if (av > peak) peak = av
                }
                t.write(floats, 0, count, AudioTrack.WRITE_BLOCKING)
                totalFrames += count
                if (!started) begin()
                if (n < bytes.size) break
              }
            } finally {
              try { input.close() } catch (e: Exception) { }
            }
          } else if (currentTts != null) {
            // ---- First play: generate sentence by sentence, play while generating, save for next time ----
            val sr = currentTts.sampleRate()
            sampleRateUsed = sr
            val t = buildTrack(sr)
            track = t
            currentAudioTrack = t

            if (cache != null) {
              try {
                val tf = File(cache.parentFile, cache.name + ".tmp")
                tmp = tf
                val os = BufferedOutputStream(FileOutputStream(tf))
                os.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(sr).array())
                out = os
              } catch (e: Exception) { out = null }
            }

            val chunks = splitText(text)
            val totalChars = maxOf(1, chunks.sumOf { it.length })
            var doneChars = 0
            val t0 = System.currentTimeMillis()
            var finishedAll = true

            synchronized(genLock) {
              for (chunk in chunks) {
                if (cancelled || activeId != id) { finishedAll = false; break }
                // Collect the sentence first, then lift it to a clear level. Some voices (Bangla models) come out
                // at 1 to 5 percent of full scale: not "silent", but far too quiet to hear even at full volume.
                val parts = ArrayList<FloatArray>()
                var chunkPeak = 0f
                currentTts.generateWithCallback(chunk, sid = sid, speed = speed, callback = { samples ->
                  if (cancelled || activeId != id) {
                    0
                  } else {
                    if (samples.isNotEmpty()) {
                      val c = samples.copyOf()
                      for (i in c.indices) {
                        val v = c[i]
                        if (v.isNaN() || v.isInfinite()) { c[i] = 0f; badSamples++ }
                        else { val av = if (v < 0f) -v else v; if (av > chunkPeak) chunkPeak = av }
                      }
                      parts.add(c)
                    }
                    1
                  }
                })
                if (!cancelled && activeId == id && parts.isNotEmpty()) {
                  // Level from the 99.9th percentile, not the single loudest sample, so one click cannot keep the voice quiet.
                  var total = 0
                  for (c in parts) total += c.size
                  val mags = FloatArray(total)
                  var mi = 0
                  for (c in parts) for (v in c) { mags[mi++] = if (v < 0f) -v else v }
                  java.util.Arrays.sort(mags)
                  val level = mags[(total * 0.999).toInt().coerceAtMost(total - 1)]
                  val g = if (level >= 0.002f && level < 0.8f) (0.8f / level).coerceAtMost(40f) else 1f
                  for (c in parts) {
                    if (g != 1f) for (i in c.indices) c[i] = (c[i] * g).coerceIn(-1f, 1f)
                    for (v in c) { val av = if (v < 0f) -v else v; if (av > peak) peak = av }
                    t.write(c, 0, c.size, AudioTrack.WRITE_BLOCKING)
                    totalFrames += c.size
                    val o = out
                    if (o != null) {
                      try {
                        val bb = ByteBuffer.allocate(c.size * 2).order(ByteOrder.LITTLE_ENDIAN)
                        for (v in c) bb.putShort((v.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
                        o.write(bb.array())
                      } catch (e: Exception) { }
                    }
                  }
                }
                doneChars += chunk.length

                // Start at once with the first piece. The old rule waited until almost everything was generated,
                // which on a slow voice meant 20 seconds of silence. A short pause between pieces is better than that.
                if (!started && totalFrames > 0) begin()
              }
            }
            if (cancelled || activeId != id) finishedAll = false

            // Short texts never reach the start rule: start them now.
            if (!started && totalFrames > 0 && !cancelled && activeId == id) begin()

            try { out?.flush(); out?.close() } catch (e: Exception) { }
            out = null
            if (finishedAll && cache != null && tmp != null && totalFrames > 0 && peak >= 0.01f) {
              if (cache.exists()) cache.delete()
              saved = tmp?.renameTo(cache) ?: false
              if (saved) pruneCache()
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
            if (silent && cached && cache != null) { try { cache.delete() } catch (e: Exception) { } }
            if (!started) sendEvent("onError", mapOf("id" to id, "message" to "The voice produced no audio. The text may contain letters this voice cannot read."))
            else if (silent && mediaVolume == 0) sendEvent("onError", mapOf("id" to id, "message" to "Media volume is 0. Turn the phone's media volume up."))
            else if (silent) sendEvent("onError", mapOf("id" to id, "message" to String.format("The voice made no sound (loudest sample %.4f, %d bad samples, %d Hz). Try another voice in Profile.", peak, badSamples, sampleRateUsed)))
            else sendEvent("onDone", mapOf("id" to id))
          }
        } catch (e: Throwable) {
          if (!cancelled && activeId == id) {
            sendEvent("onError", mapOf("id" to id, "message" to (e.message ?: "Playback failed")))
          }
        } finally {
          try { out?.close() } catch (e: Exception) { }
          if (!saved) { try { tmp?.delete() } catch (e: Exception) { } }
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
