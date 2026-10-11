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
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
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
        val modelConfig = OfflineTtsModelConfig(vits = vits, numThreads = 2, provider = "cpu", debug = false)
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

    // Generates and plays one text. Audio starts as soon as the first sentence is ready.
    Function("speak") { id: Int, text: String, speed: Float, sid: Int ->
      val currentTts = tts
      if (currentTts == null) {
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
        var audioTrack: AudioTrack? = null
        var started = false
        try {
          requestAudioFocus()
          val sampleRate = currentTts.sampleRate()
          val minBuf = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
          val bufSize = maxOf(minBuf, sampleRate * 4)
          audioTrack = AudioTrack.Builder()
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
          currentAudioTrack = audioTrack

          var totalWrittenFrames = 0
          synchronized(genLock) {
            currentTts.generateWithCallback(text, sid = sid, speed = speed, callback = { samples ->
              if (cancelled || activeId != id) {
                0
              } else {
                if (samples.isNotEmpty()) {
                  if (!started) {
                    started = true
                    sendEvent("onStart", mapOf("id" to id))
                    audioTrack.play()
                  }
                  audioTrack.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
                  totalWrittenFrames += samples.size
                }
                1
              }
            })
          }

          // Wait until everything written has been played. Give up if the position stops moving for 4 s.
          if (started && !cancelled && activeId == id) {
            var lastHead = -1
            var lastMove = System.currentTimeMillis()
            while (!cancelled && activeId == id) {
              val head = audioTrack.playbackHeadPosition
              if (head >= totalWrittenFrames) break
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
          try { audioTrack?.stop(); audioTrack?.release() } catch (e: Exception) { }
          if (currentAudioTrack === audioTrack) currentAudioTrack = null
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
