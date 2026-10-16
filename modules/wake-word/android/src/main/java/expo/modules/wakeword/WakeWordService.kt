package expo.modules.wakeword

import android.app.KeyguardManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
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
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.IOException
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
 * All state is touched on the main thread; only model loading runs elsewhere.
 */
class WakeWordService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val loader: ExecutorService = Executors.newSingleThreadExecutor()

  private var model: Model? = null
  private var recognizer: Recognizer? = null
  private var speechService: SpeechService? = null
  private var phrase: String = "hey nova"
  private var paused = false
  private var loading = false
  private var lastWakeAt = 0L

  private val autoResume = Runnable { doResume() }
  private val retryListening = Runnable { if (!paused) startRecognizer() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    WakeWordBridge.service = this
    phrase = WakePrefs.phrase(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!WakePrefs.isEnabled(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    // Must be called within seconds of startForegroundService(). If Android refuses
    // (e.g. a sticky restart while the app isn't visible), ask the user to tap.
    if (!enterForeground()) {
      WakeNotifications.showResumePrompt(this)
      stopSelf()
      return START_NOT_STICKY
    }
    WakeNotifications.cancelResumePrompt(this)
    if (model == null) loadModelAndListen() else if (speechService == null && !paused) startRecognizer()
    return START_STICKY
  }

  private fun enterForeground(): Boolean =
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
      ServiceCompat.startForeground(this, WakeNotifications.LISTENING_ID, WakeNotifications.listening(this, phrase, paused), type)
      true
    } catch (e: Exception) {
      false
    }

  private fun updateNotification() {
    try {
      NotificationManagerCompat.from(this)
        .notify(WakeNotifications.LISTENING_ID, WakeNotifications.listening(this, phrase, paused))
    } catch (_: SecurityException) {
      // Notifications not allowed; the service keeps working.
    }
  }

  private fun loadModelAndListen() {
    if (loading) return
    loading = true
    WakeWordBridge.setState("starting")
    val context: Context = applicationContext
    loader.execute {
      try {
        if (!VoskModel.isReady(context)) throw IOException("The speech model isn’t downloaded yet")
        val dir = VoskModel.modelDir(context)
        val loaded = Model(dir.absolutePath)
        val chosen = VoskModel.choosePhrase(dir)
        WakePrefs.setPhrase(context, chosen)
        main.post {
          loading = false
          model = loaded
          phrase = chosen
          updateNotification()
          if (!paused) startRecognizer()
        }
      } catch (e: Exception) {
        main.post {
          loading = false
          WakeWordBridge.setState("error", "Couldn’t load the speech model: ${e.message}")
        }
      }
    }
  }

  private fun startRecognizer() {
    val loadedModel = model ?: return
    main.removeCallbacks(retryListening)
    stopRecognizer()
    try {
      val grammar = JSONArray(listOf(phrase, "[unk]")).toString()
      val rec = Recognizer(loadedModel, SAMPLE_RATE, grammar)
      rec.setWords(true)
      recognizer = rec
      val service = SpeechService(rec, SAMPLE_RATE)
      service.startListening(listener)
      speechService = service
      paused = false
      updateNotification()
      WakeWordBridge.setState("listening")
    } catch (e: IOException) {
      // Usually "microphone already in use" (a call, another recorder). Try again soon.
      stopRecognizer()
      WakeWordBridge.setState("error", "Microphone busy; trying again shortly")
      main.postDelayed(retryListening, RETRY_MS)
    }
  }

  /** Stops listening and releases the microphone. */
  private fun stopRecognizer() {
    speechService?.let {
      try {
        it.stop()
        it.shutdown()
      } catch (_: Exception) {
      }
    }
    speechService = null
    recognizer?.let {
      try {
        it.close()
      } catch (_: Exception) {
      }
    }
    recognizer = null
  }

  private val listener = object : RecognitionListener {
    override fun onPartialResult(hypothesis: String?) {}

    override fun onResult(hypothesis: String?) {
      if (!paused && hypothesis != null && isWakePhrase(hypothesis)) onWakeDetected()
    }

    override fun onFinalResult(hypothesis: String?) {}

    override fun onError(exception: Exception?) {
      if (paused) return
      stopRecognizer()
      WakeWordBridge.setState("error", exception?.message ?: "Listening stopped")
      main.postDelayed(retryListening, RETRY_MS)
    }

    override fun onTimeout() {
      if (!paused) startRecognizer()
    }
  }

  /** Exactly the wake phrase, with every word heard confidently enough. */
  private fun isWakePhrase(json: String): Boolean =
    try {
      val result = JSONObject(json)
      if (result.optString("text") != phrase) {
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
    stopRecognizer()
    updateNotification()
    WakeWordBridge.setState("paused")
    playChime()
    main.postDelayed({ deliverWake() }, CHIME_MS)
    main.removeCallbacks(autoResume)
    main.postDelayed(autoResume, AUTO_RESUME_MS)
  }

  private fun deliverWake() {
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
    if (Settings.canDrawOverlays(this)) {
      try {
        startActivity(intent)
        return
      } catch (_: Exception) {
        // Fall through to the notification.
      }
    }
    WakeNotifications.showWake(this, intent)
  }

  private fun playChime() {
    try {
      val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 80)
      tone.startTone(ToneGenerator.TONE_PROP_ACK, 150)
      main.postDelayed({ tone.release() }, 250)
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
    main.removeCallbacks(autoResume)
    WakeNotifications.cancelWake(this)
    if (!WakePrefs.isEnabled(this)) return
    paused = false
    if (model == null) loadModelAndListen() else startRecognizer()
  }

  private fun doPause() {
    paused = true
    main.removeCallbacks(retryListening)
    stopRecognizer()
    updateNotification()
    WakeWordBridge.setState("paused")
    main.removeCallbacks(autoResume)
    main.postDelayed(autoResume, AUTO_RESUME_MS)
  }

  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    stopRecognizer()
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

  companion object {
    private const val SAMPLE_RATE = 16000.0f
    private const val COOLDOWN_MS = 2_000L
    private const val CHIME_MS = 300L
    private const val RETRY_MS = 5_000L
    /** Resume listening even if JS never says the conversation ended. */
    private const val AUTO_RESUME_MS = 5 * 60_000L
  }
}
