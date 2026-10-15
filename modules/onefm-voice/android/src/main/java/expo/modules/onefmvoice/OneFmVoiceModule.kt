package expo.modules.onefmvoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.audiofx.LoudnessEnhancer
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
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

// ---- Loudness settings (change these two to make the voice louder or softer) ----
// Target loudness (RMS of the voiced parts). 0.22 is close to a loud song at full volume. Lower it if the voice sounds harsh.
private const val TARGET_RMS = 0.22f
// Extra boost from Android's LoudnessEnhancer, in millibels (600 = +6 dB). Set 0 to switch it off if a phone crackles.
private const val ENHANCER_GAIN_MB = 600

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

  // Cleans and levels one finished piece in place: NaN removed, constant offset (DC) removed, then the voiced part is lifted to
  // TARGET_RMS (loudness by RMS, not by peak, so every sentence is equally loud and as strong as a mastered song). A soft limiter
  // rounds off the peaks above 0.6 so nothing is cut flat. `boost` lets an excited sentence be louder and a hesitant one softer.
  private fun levelAudio(a: FloatArray, boost: Float): Leveled {
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
    var pk = 0f
    for (v in a) { val av = if (v < 0f) -v else v; if (av > pk) pk = av }
    var g = 1f
    if (pk >= 0.002f) {
      // Only the voiced samples count, so the silence between words does not make the gain too high.
      val gate = pk * 0.05f
      var sq0 = 0.0
      var n = 0
      for (v in a) { val av = if (v < 0f) -v else v; if (av > gate) { sq0 += (v * v).toDouble(); n++ } }
      val r = if (n > 0) Math.sqrt(sq0 / n) else 0.0
      if (r > 0.0005) g = ((TARGET_RMS * boost) / r).toFloat().coerceIn(0.5f, 40f)
    }
    val knee = 0.6f
    var peak = 0f
    var sq = 0.0
    for (i in a.indices) {
      val y = a[i] * g
      val ay = if (y < 0f) -y else y
      val o = if (ay <= knee) y else (if (y < 0f) -1f else 1f) * (knee + (1f - knee) * Math.tanh(((ay - knee) / (1f - knee)).toDouble()).toFloat())
      a[i] = o
      val ao = if (o < 0f) -o else o
      if (ao > peak) peak = ao
      sq += (o * o).toDouble()
    }
    return Leveled(raw, peak, Math.sqrt(sq / maxOf(a.size, 1)), dc, bad)
  }

  // IMPORTANT: a stream AudioTrack does not start playing until its buffer has been filled once (or stop() is called).
  // The old 20 s buffer was never filled by a 4 to 7 s message, so nothing was heard and the track was released at the end.
  // Now: 16-bit PCM (works on every phone) and a buffer of about 1 s. The player also calls stop() after the last write,
  // which makes Android play out whatever is still in the buffer.
  private fun buildTrack(sampleRate: Int): AudioTrack {
    val minBuf = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val bufSize = maxOf(minBuf, sampleRate * 2) // 2 bytes per sample, 1 s
    val built = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      )
      .setBufferSizeInBytes(bufSize)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    if (built.state != AudioTrack.STATE_INITIALIZED) {
      try { built.release() } catch (e: Exception) { }
      throw IllegalStateException("Android could not open the audio output (sample rate $sampleRate Hz).")
    }
    return built
  }

  // A piece of text with the emotion mark of its sentence: '.' normal, '!' excited, '?' question, '\u2026' hesitant.
  // The JS side leaves ! ? and ... at the end of a sentence. The voice model itself only gets a plain full stop.
  private class Piece(val text: String, val mark: Char)

  private fun speedOf(m: Char): Float = when (m) { '!' -> 1.08f; '\u2026' -> 0.9f; else -> 1.0f }
  private fun loudOf(m: Char): Float = when (m) { '!' -> 1.12f; '\u2026' -> 0.85f; else -> 1.0f }

  // Some models hand over the whole text as one block, so the voice would stay silent until everything is
  // generated. Cutting the text into short sentences here makes the first audio ready after the first one.
  private fun splitText(text: String): List<Piece> {
    val sentences = text.trim().split(Regex("(?<=[.\u0964?!\u2026])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
    val pieces = ArrayList<Piece>()
    for (sentence in sentences) {
      val last = sentence.last()
      val mark = if (last == '!' || last == '?' || last == '\u2026') last else '.'
      val body = if (mark == '.') sentence else sentence.trimEnd('!', '?', '\u2026', '.', ' ') + "."
      if (body.length <= 100) { pieces.add(Piece(body, mark)); continue }
      var cur = StringBuilder()
      for (part in body.split(Regex("(?<=,)\\s+"))) {
        if (cur.isNotEmpty() && cur.length + part.length > 80) {
          pieces.add(Piece(cur.toString().trim(), mark))
          cur = StringBuilder()
        }
        if (cur.isNotEmpty()) cur.append(' ')
        cur.append(part)
      }
      if (cur.isNotEmpty()) pieces.add(Piece(cur.toString().trim(), mark))
    }
    val out = ArrayList<Piece>()
    var carry: Piece? = null
    for (piece in pieces) {
      val c = carry
      val joined = if (c == null) piece else Piece("${c.text} ${piece.text}", piece.mark)
      if (joined.text.length < 20) { carry = joined } else { out.add(joined); carry = null }
    }
    val rest = carry
    if (rest != null) {
      if (out.isNotEmpty()) { val l = out.removeAt(out.size - 1); out.add(Piece("${l.text} ${rest.text}", rest.mark)) } else out.add(rest)
    }
    if (out.isEmpty()) return listOf(Piece(text, '.'))
    // A short first piece: the first sound is ready after about 2 to 3 seconds of generating.
    val first = out[0]
    if (first.text.length > 40) {
      val cut = first.text.lastIndexOf(' ', 36)
      if (cut >= 16) {
        out[0] = Piece(first.text.substring(0, cut).trim(), first.mark)
        out.add(1, Piece(first.text.substring(cut + 1).trim(), first.mark))
      }
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

    // Speaks one text. Sentences are generated one by one and handed to a player thread through a queue.
    // The player starts as soon as the audio made so far is enough to last until generation finishes (estimated from the
    // speed measured on this phone), so the voice starts earlier than "after everything" and still never stops in the middle.
    // A text that was spoken before starts at once from memory.
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
        val queue = LinkedBlockingQueue<FloatArray>()
        val endMark = FloatArray(0)
        val writerError = AtomicReference<String?>(null)
        val startedFlag = AtomicBoolean(false)
        val writtenFrames = AtomicLong(0L)
        var writer: Thread? = null
        var sr = 0
        var peak = 0f
        var rawPeak = 0f
        var sumSq = 0.0
        var totalSamples = 0L
        var dcMax = 0f
        var bad = 0
        var genMs = 0L
        var track: AudioTrack? = null
        var enhancer: LoudnessEnhancer? = null
        try {
          requestAudioFocus()
          val mediaVolume = try {
            (appContext.reactContext?.applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 1
          } catch (e: Exception) { 1 }

          fun live() = !cancelled && activeId == id && writerError.get() == null

          // ---- Player thread: takes finished pieces from the queue and writes them to the speaker ----
          fun startWriter() {
            if (writer != null) return
            val w = Thread {
              try {
                val t = buildTrack(sr)
                track = t
                currentAudioTrack = t
                // Extra loudness from Android itself (it has its own limiter). If a phone has no such effect, it is simply skipped.
                if (ENHANCER_GAIN_MB > 0) {
                  try { val le = LoudnessEnhancer(t.audioSessionId); le.setTargetGain(ENHANCER_GAIN_MB); le.setEnabled(true); enhancer = le } catch (e: Throwable) { }
                }
                startedFlag.set(true)
                sendEvent("onStart", mapOf("id" to id))
                try { t.setVolume(1.0f) } catch (e: Exception) { }
                t.play()
                val playStart = System.currentTimeMillis()
                val chunk = ShortArray(4096)
                var ended = false
                while (!ended && !cancelled && activeId == id) {
                  val item = queue.poll(100, TimeUnit.MILLISECONDS) ?: continue
                  if (item === endMark) { ended = true; break }
                  var pos = 0
                  while (pos < item.size && !cancelled && activeId == id) {
                    val n = minOf(chunk.size, item.size - pos)
                    for (i in 0 until n) {
                      val v = item[pos + i]
                      val c = if (v > 1f) 1f else if (v < -1f) -1f else v
                      chunk[i] = (c * 32767f).toInt().toShort()
                    }
                    var off = 0
                    while (off < n && !cancelled && activeId == id) {
                      val wr = t.write(chunk, off, n - off, AudioTrack.WRITE_BLOCKING)
                      if (wr < 0) throw RuntimeException("Android refused the audio (write error $wr).")
                      if (wr == 0) { Thread.sleep(5); continue }
                      off += wr
                    }
                    pos += n
                    writtenFrames.addAndGet(n.toLong())
                  }
                }
                if (ended && !cancelled && activeId == id) {
                  // Play what is left in the buffer, then stop. This also starts a track that never filled its buffer.
                  try { t.stop() } catch (e: Exception) { }
                  val total = writtenFrames.get()
                  val durMs = total * 1000L / maxOf(sr, 1)
                  var headMoved = false
                  var lastHead = -1
                  var lastMove = System.currentTimeMillis()
                  while (!cancelled && activeId == id) {
                    val head = t.playbackHeadPosition
                    val now = System.currentTimeMillis()
                    if (head >= total) break
                    if (head > 0) headMoved = true
                    if (head != lastHead) { lastHead = head; lastMove = now }
                    // Some phones do not report the play position: then trust the clock instead of the position.
                    if (!headMoved && now - playStart > durMs + 1500) break
                    if (headMoved && now - lastMove > 2500) break
                    Thread.sleep(15)
                  }
                  if (!cancelled && activeId == id) Thread.sleep(150) // let the last samples leave the speaker
                }
              } catch (e: Throwable) {
                writerError.compareAndSet(null, e.message ?: "Playback failed")
              }
            }
            w.isDaemon = true
            writer = w
            w.start()
          }

          fun account(a: FloatArray, lv: Leveled) {
            if (lv.rawPeak > rawPeak) rawPeak = lv.rawPeak
            if (lv.peak > peak) peak = lv.peak
            sumSq += lv.rms * lv.rms * a.size
            totalSamples += a.size
            if (kotlin.math.abs(lv.dc) > dcMax) dcMax = kotlin.math.abs(lv.dc)
            bad += lv.bad
          }

          val whole = ArrayList<FloatArray>()

          if (memHit != null) {
            // ---- Replay from memory: starts at once ----
            sr = memHit.second
            val audio = memHit.first
            for (v in audio) { val av = if (v < 0f) -v else v; if (av > peak) peak = av }
            rawPeak = peak
            totalSamples = audio.size.toLong()
            queue.offer(audio)
            startWriter()
          } else if (currentTts != null) {
            // ---- Generate sentence by sentence; start playing as soon as it is safe ----
            sr = currentTts.sampleRate()
            val t0 = System.currentTimeMillis()
            val chunks = splitText(text)
            val totalChars = maxOf(1, chunks.sumOf { it.text.length })
            var charsDone = 0
            var queuedFrames = 0L
            val gap = FloatArray(sr * 12 / 100) // 120 ms of silence between sentences
            val midGap = FloatArray(sr * 18 / 100) // after a question
            val longGap = FloatArray(sr * 32 / 100) // after a hesitant "..." sentence
            synchronized(genLock) {
              for ((ci, chunk) in chunks.withIndex()) {
                if (!live()) break
                val parts = ArrayList<FloatArray>()
                if (ci > 0) parts.add(when (chunks[ci - 1].mark) { '\u2026' -> longGap; '?' -> midGap; else -> gap })
                currentTts.generateWithCallback(chunk.text, sid = sid, speed = speed * speedOf(chunk.mark), callback = { samples ->
                  if (!live()) {
                    0
                  } else {
                    if (samples.isNotEmpty()) parts.add(samples.copyOf())
                    1
                  }
                })
                if (!live()) break
                var total = 0
                for (c in parts) total += c.size
                if (total > 0) {
                  val piece = FloatArray(total)
                  var o = 0
                  for (c in parts) { System.arraycopy(c, 0, piece, o, c.size); o += c.size }
                  val lv = levelAudio(piece, loudOf(chunk.mark))
                  account(piece, lv)
                  whole.add(piece)
                  queue.offer(piece)
                  queuedFrames += piece.size
                }
                charsDone += chunk.text.length
                if (writer == null) {
                  // Start when the audio we already have lasts longer than the time still needed to make the rest.
                  val elapsed = System.currentTimeMillis() - t0
                  val remainingChars = totalChars - charsDone
                  val estRemainingMs = if (charsDone > 0) elapsed.toDouble() * remainingChars / charsDone else 0.0
                  val queuedMs = queuedFrames * 1000.0 / sr
                  if (queuedFrames > 0 && (remainingChars <= 0 || queuedMs >= estRemainingMs * 1.15 + 300.0)) startWriter()
                }
              }
            }
            genMs = System.currentTimeMillis() - t0
            if (queuedFrames == 0L && live()) {
              // nothing was made: fall through to the "no audio" message below
            } else if (live()) {
              // Cache the whole message (already levelled) for instant replays
              if (memKey.isNotEmpty() && peak >= 0.01f) {
                var total = 0
                for (c in whole) total += c.size
                val all = FloatArray(total)
                var o = 0
                for (c in whole) { System.arraycopy(c, 0, all, o, c.size); o += c.size }
                memCache[memKey] = Pair(all, sr)
              }
            }
          }

          // ---- Tell the player there is no more, make sure it is running, and wait for it to finish ----
          if (live()) {
            queue.offer(endMark)
            startWriter()
          }
          if (live() || writer != null) {
            sendEvent("onInfo", mapOf(
              "id" to id,
              "gen" to genMs.toInt(),
              "audio" to (totalSamples.toDouble() / maxOf(sr, 1)),
              "raw" to rawPeak.toDouble(),
              "peak" to peak.toDouble(),
              "rms" to Math.sqrt(sumSq / maxOf(totalSamples, 1L)),
              "dc" to dcMax.toDouble()
            ))
          }
          writer?.join()

          val err = writerError.get()
          if (!cancelled && activeId == id) {
            val silent = startedFlag.get() && totalSamples > 0 && peak < 0.01f
            if (err != null) sendEvent("onError", mapOf("id" to id, "message" to err))
            else if (!startedFlag.get()) sendEvent("onError", mapOf("id" to id, "message" to "The voice produced no audio. The text may contain letters this voice cannot read."))
            else if (silent && mediaVolume == 0) sendEvent("onError", mapOf("id" to id, "message" to "Media volume is 0. Turn the phone's media volume up."))
            else if (silent) sendEvent("onError", mapOf("id" to id, "message" to String.format("The voice made no sound (loudest sample %.4f, %d bad samples, %d Hz). Try another voice in Profile.", peak, bad, sr)))
            else sendEvent("onDone", mapOf("id" to id))
          }
        } catch (e: Throwable) {
          if (!cancelled && activeId == id) {
            sendEvent("onError", mapOf("id" to id, "message" to (e.message ?: "Playback failed")))
          }
        } finally {
          try { enhancer?.release() } catch (e: Throwable) { }
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
