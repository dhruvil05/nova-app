package expo.modules.wakeword

import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import org.json.JSONArray
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Foreground service (type microphone) that listens for the wake phrase on-device
 * with Vosk (spec 9.2). Nothing leaves the phone until the phrase is heard.
 *
 * On a wake-up it releases the microphone (so Android's speech recogniser can use
 * it), plays a short chime, and either tells JavaScript (app on screen) or opens
 * the voice screen, over the lock screen if needed. JavaScript calls
 * resumeListening() when the conversation ends; a safety timer resumes anyway.
 *
 * Service state is touched only on the main thread. Audio is read on a
 * [ListenThread]; the model loads on [loader].
 */
class WakeWordService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val loader: ExecutorService = Executors.newSingleThreadExecutor()

  private var model: Model? = null
  private var listenThread: ListenThread? = null
  private var paused = false
  private var loading = false
  private var destroyed = false
  private var lastWakeAt = 0L
  private var tone: ToneGenerator? = null

  private val autoResume = Runnable { doResume() }
  private val retryListening = Runnable { if (!paused) startListening() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    WakeWordBridge.service = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForeground() must come first: a service started with
    // startForegroundService() that stops before calling it crashes the app.
    val inForeground = enterForeground()
    val enabled = WakePrefs.isEnabled(this)
    if (!inForeground || !enabled) {
      // Android refused (e.g. a sticky restart while Nova isn't visible): ask the user to tap.
      if (!inForeground && enabled) WakeNotifications.showResumePrompt(this)
      if (inForeground) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    WakeNotifications.cancelResumePrompt(this)
    if (model == null) loadModelAndListen() else if (listenThread == null && !paused) startListening()
    return START_STICKY
  }

  private fun enterForeground(): Boolean =
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
      ServiceCompat.startForeground(this, WakeNotifications.LISTENING_ID, WakeNotifications.listening(this, paused), type)
      true
    } catch (e: Exception) {
      false
    }

  private fun updateNotification() {
    if (destroyed) return
    try {
      NotificationManagerCompat.from(this)
        .notify(WakeNotifications.LISTENING_ID, WakeNotifications.listening(this, paused))
    } catch (_: SecurityException) {
      // Notifications not allowed; the service keeps working.
    }
  }

  private fun loadModelAndListen() {
    if (loading || destroyed) return
    loading = true
    WakeWordBridge.setState("starting")
    val context: Context = applicationContext
    try {
      loader.execute {
        try {
          if (!VoskModel.isReady(context)) throw IllegalStateException("The speech model isn’t downloaded yet")
          val loaded = Model(VoskModel.modelDir(context).absolutePath)
          main.post {
            loading = false
            // The service may have stopped while the model was loading.
            if (destroyed) {
              loaded.close()
              return@post
            }
            model = loaded
            if (!paused) startListening()
          }
        } catch (e: Exception) {
          main.post {
            loading = false
            if (!destroyed) WakeWordBridge.setState("error", "Couldn’t load the speech model: ${e.message}")
          }
        }
      }
    } catch (_: java.util.concurrent.RejectedExecutionException) {
      loading = false
    }
  }

  private fun startListening() {
    if (destroyed) return
    val loadedModel = model ?: return
    main.removeCallbacks(retryListening)
    stopListening()
    val recognizer =
      try {
        Recognizer(loadedModel, SAMPLE_RATE.toFloat(), JSONArray(WAKE_PHRASES + "[unk]").toString()).apply {
          setWords(true)
        }
      } catch (e: Exception) {
        WakeWordBridge.setState("error", "Couldn’t start listening: ${e.message}")
        return
      }
    val thread = ListenThread(recognizer)
    listenThread = thread
    thread.start()
    paused = false
    updateNotification()
    WakeWordBridge.setState("listening")
  }

  /** Stops listening and releases the microphone (waits briefly for the audio thread). */
  private fun stopListening() {
    listenThread?.let {
      it.finish()
      try {
        it.join(JOIN_MS)
      } catch (_: InterruptedException) {
      }
    }
    listenThread = null
  }

  /** Called on the main thread with a final Vosk result. */
  private fun onResult(json: String) {
    if (!paused && !destroyed && isWakePhrase(json)) onWakeDetected()
  }

  /** Called on the main thread when the microphone can't be read. */
  private fun onListenError(message: String) {
    if (paused || destroyed) return
    stopListening()
    // Usually the microphone is busy (a call, another recorder). Try again soon.
    WakeWordBridge.setState("error", message)
    main.postDelayed(retryListening, RETRY_MS)
  }

  /** One of the wake phrases, with every word heard confidently enough. */
  private fun isWakePhrase(json: String): Boolean =
    try {
      val result = JSONObject(json)
      if (result.optString("text") !in WAKE_PHRASES) {
        false
      } else {
        val words = result.optJSONArray("result")
        val threshold = WakePrefs.threshold(this)
        words == null || (0 until words.length()).all { i -> words.getJSONObject(i).optDouble("conf", 0.0) >= threshold }
      }
    } catch (_: Exception) {
      false
    }

  private fun onWakeDetected() {
    val now = System.currentTimeMillis()
    if (now - lastWakeAt < COOLDOWN_MS) return
    lastWakeAt = now
    // Free the microphone for Android's speech recogniser, but stay in the
    // foreground: on HyperOS recognition fails without a microphone service.
    paused = true
    stopListening()
    updateNotification()
    WakeWordBridge.setState("paused")
    playChime()
    main.postDelayed({ deliverWake() }, CHIME_MS)
    main.removeCallbacks(autoResume)
    main.postDelayed(autoResume, AUTO_RESUME_MS)
  }

  private fun deliverWake() {
    if (destroyed) return
    val keyguard = getSystemService(KeyguardManager::class.java)
    val locked = keyguard?.isKeyguardLocked == true
    val js = WakeWordBridge.onWake
    if (!locked && WakeWordBridge.activityResumed && js != null) {
      js(false)
      return
    }
    // App in the background, killed, or phone locked: open the voice screen.
    // JS timers don't run in the background, so the screen must come to the front.
    val intent = WakeNotifications.appLink(this, WakeWordBridge.WAKE_URI, wake = true)
    var launched = false
    if (Settings.canDrawOverlays(this)) {
      launched =
        try {
          startActivity(intent)
          true
        } catch (_: Exception) {
          false
        }
    }
    // A blocked background start doesn't throw (e.g. HyperOS pop-up permission
    // off), so always post the notification too; the activity cancels it when it
    // opens. Use a full-screen intent only when no launch was attempted.
    WakeNotifications.showWake(this, intent, fullScreen = !launched)
  }

  private fun playChime() {
    try {
      tone?.release()
      val generator = ToneGenerator(AudioManager.STREAM_MUSIC, 80)
      tone = generator
      generator.startTone(ToneGenerator.TONE_PROP_ACK, 150)
      main.postDelayed({
        if (tone === generator) {
          generator.release()
          tone = null
        }
      }, 250)
    } catch (_: RuntimeException) {
      // No chime available; carry on.
    }
  }

  /** Called by JS when the conversation is over. Safe from any thread. */
  fun resumeListening() {
    onMain { doResume() }
  }

  /** Called by JS when it needs the microphone without a wake-up (e.g. in-app voice). Safe from any thread. */
  fun pauseListening() {
    onMain { doPause() }
  }

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post { block() }
  }

  private fun doResume() {
    if (destroyed) return
    main.removeCallbacks(autoResume)
    WakeNotifications.cancelWake(this)
    if (!WakePrefs.isEnabled(this)) return
    paused = false
    if (model == null) loadModelAndListen() else startListening()
  }

  private fun doPause() {
    if (destroyed) return
    paused = true
    main.removeCallbacks(retryListening)
    stopListening()
    updateNotification()
    WakeWordBridge.setState("paused")
    main.removeCallbacks(autoResume)
    main.postDelayed(autoResume, AUTO_RESUME_MS)
  }

  override fun onDestroy() {
    destroyed = true
    main.removeCallbacksAndMessages(null)
    stopListening()
    tone?.release()
    tone = null
    try {
      model?.close()
    } catch (_: Exception) {
    }
    model = null
    loader.shutdownNow()
    if (WakeWordBridge.service === this) WakeWordBridge.service = null
    WakeWordBridge.setState("stopped")
    super.onDestroy()
  }

  /**
   * Reads the microphone and feeds Vosk. Our own loop (instead of Vosk's
   * SpeechService) so a failed read becomes an error message, not an uncaught
   * exception that would crash the app.
   */
  private inner class ListenThread(private val recognizer: Recognizer) : Thread("nova-wake-word") {
    @Volatile private var running = true

    fun finish() {
      running = false
    }

    @SuppressLint("MissingPermission") // Checked before the service starts.
    override fun run() {
      val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      if (minBuffer <= 0) {
        fail("Microphone isn’t available")
        return
      }
      val record =
        try {
          AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer, SAMPLE_RATE / 5 * 2) * 2,
          )
        } catch (e: Exception) {
          fail("Microphone busy; trying again shortly")
          return
        }
      try {
        if (record.state != AudioRecord.STATE_INITIALIZED) {
          fail("Microphone busy; trying again shortly")
          return
        }
        // About 0.1 s of audio per read.
        val buffer = ShortArray(SAMPLE_RATE / 10)
        record.startRecording()
        while (running) {
          val read = record.read(buffer, 0, buffer.size)
          if (read < 0) {
            fail("Microphone stopped; trying again shortly")
            break
          }
          if (read > 0 && recognizer.acceptWaveForm(buffer, read)) {
            val result = recognizer.result
            main.post { onResult(result) }
          }
        }
      } catch (e: Exception) {
        fail("Listening stopped; trying again shortly")
      } finally {
        try {
          record.stop()
        } catch (_: Exception) {
        }
        record.release()
        try {
          recognizer.close()
        } catch (_: Exception) {
        }
      }
    }

    private fun fail(message: String) {
      if (running) main.post { onListenError(message) }
    }
  }

  companion object {
    /**
     * Accepted wake phrases. Vosk silently drops words its model doesn't know,
     * so "hey computer" is a backup in case the model lacks "nova".
     */
    val WAKE_PHRASES = listOf("hey nova", "hey computer")

    private const val SAMPLE_RATE = 16000
    private const val COOLDOWN_MS = 2_000L
    private const val CHIME_MS = 300L
    private const val RETRY_MS = 5_000L
    private const val JOIN_MS = 500L
    /** Resume listening even if JS never says the conversation ended. */
    private const val AUTO_RESUME_MS = 5 * 60_000L
  }
}
