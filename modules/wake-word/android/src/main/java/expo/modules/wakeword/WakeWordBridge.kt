package expo.modules.wakeword

import android.app.Activity
import android.content.Context
import java.lang.ref.WeakReference

/**
 * Shared state between the JS module, the listening service and the activity
 * lifecycle listener. Everything here is touched on the main thread.
 */
object WakeWordBridge {
  /** Set while the JS module exists; delivers events to JavaScript. */
  @Volatile var onWake: ((locked: Boolean) -> Unit)? = null
  @Volatile var onStatus: ((state: String, message: String?) -> Unit)? = null

  @Volatile var service: WakeWordService? = null
  @Volatile var state: String = "stopped"
    private set
  @Volatile var lastMessage: String? = null
    private set

  /** True while Nova's activity is on screen (resumed). */
  @Volatile var activityResumed: Boolean = false
  var activityRef: WeakReference<Activity>? = null

  fun setState(next: String, message: String? = null) {
    state = next
    lastMessage = message
    onStatus?.invoke(next, message)
  }

  const val EXTRA_WAKE = "nova_wake"
  const val WAKE_URI = "nova://voice?wake=1"
  const val RESUME_URI = "nova://wake-resume"
}

/** Settings the service needs even when the app isn't running. */
object WakePrefs {
  private const val FILE = "nova_wake"

  private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean("enabled", false)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean("enabled", enabled).apply()
  }

  /** Minimum per-word confidence (0-1) for a wake-up. Higher = fewer false wake-ups. */
  fun threshold(context: Context): Float = prefs(context).getFloat("threshold", 0.7f)

  fun setThreshold(context: Context, value: Float) {
    prefs(context).edit().putFloat("threshold", value.coerceIn(0.3f, 0.95f)).apply()
  }

  fun phrase(context: Context): String = prefs(context).getString("phrase", "hey nova") ?: "hey nova"

  fun setPhrase(context: Context, phrase: String) {
    prefs(context).edit().putString("phrase", phrase).apply()
  }
}
