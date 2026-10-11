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
    return AudioTrack.Builder()
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
  }

  // Some models hand over the whole text as one block, so the voice would stay silent until everything is
  // generated. Cutting the text into short sentences here makes the first audio ready after the first one.
  private fun splitText(text: String): List<String> {
    val sentences = text.trim().split(Regex("(?<=[.])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
    val pieces = ArrayList<String>()
    for (sentence in sentences) {
      if (sentence.length <= 130) { pieces.add(sentence); continue }
      var cur = StringBuilder()
      for (part in sentence.split(Regex("(?<=,)\\s+"))) {
        if (cur.isNotEmpty() && cur.length + part.length > 110) {
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
    return if (out.isEmpty()) listOf(text) else out
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

          fun begin() {
            val t = track
            if (t != null && !started) {
              started = true
              sendEvent("onStart", mapOf("id" to id))
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
                for (i in 0 until count) floats[i] = bb.getShort() / 32768f
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
                currentTts.generateWithCallback(chunk, sid = sid, speed = speed, callback = { samples ->
                  if (cancelled || activeId != id) {
                    0
                  } else {
                    if (samples.isNotEmpty()) {
                      t.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
                      totalFrames += samples.size
                      val o = out
                      if (o != null) {
                        try {
                          val bb = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
                          for (v in samples) bb.putShort((v.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
                          o.write(bb.array())
                        } catch (e: Exception) { }
                      }
                    }
                    1
                  }
                })
                doneChars += chunk.length

                // Start playing as soon as the audio already generated will last until the rest is ready.
                if (!started && totalFrames > 0) {
                  val buffered = totalFrames.toDouble() / sr
                  val elapsed = (System.currentTimeMillis() - t0) / 1000.0
                  val rtf = elapsed / buffered
                  val estTotal = buffered * totalChars / maxOf(1, doneChars)
                  val remaining = maxOf(0.0, estTotal - buffered)
                  if (buffered >= 1.0 && (buffered >= remaining * rtf || (elapsed >= 6.0 && buffered >= 2.0) || buffered >= 15.0)) begin()
                }
              }
            }
            if (cancelled || activeId != id) finishedAll = false

            // Short texts never reach the start rule: start them now.
            if (!started && totalFrames > 0 && !cancelled && activeId == id) begin()

            try { out?.flush(); out?.close() } catch (e: Exception) { }
            out = null
            if (finishedAll && cache != null && tmp != null && totalFrames > 0) {
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
            if (!started) sendEvent("onError", mapOf("id" to id, "message" to "The voice produced no audio"))
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
