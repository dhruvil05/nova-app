package expo.modules.wakeword

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

class WakeWordPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(WakeActivityListener())
}

/**
 * Tracks whether Nova is on screen, and lets the activity appear over the lock
 * screen ONLY when it was opened by "Hey Nova". JS turns this off again when the
 * voice conversation ends, so the app is never shown over the lock screen otherwise.
 */
class WakeActivityListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    WakeWordBridge.activityRef = WeakReference(activity)
    if (activity.intent?.getBooleanExtra(WakeWordBridge.EXTRA_WAKE, false) == true) {
      showOverLockScreen(activity, true)
    }
  }

  override fun onResume(activity: Activity) {
    WakeWordBridge.activityRef = WeakReference(activity)
    WakeWordBridge.activityResumed = true
    WakeNotifications.cancelWake(activity)
  }

  override fun onPause(activity: Activity) {
    WakeWordBridge.activityResumed = false
  }

  override fun onDestroy(activity: Activity) {
    if (WakeWordBridge.activityRef?.get() === activity) {
      WakeWordBridge.activityRef = null
      WakeWordBridge.activityResumed = false
    }
  }

  // Nullable: Expo's activity wrapper may pass null through.
  override fun onNewIntent(intent: Intent?): Boolean {
    if (intent?.getBooleanExtra(WakeWordBridge.EXTRA_WAKE, false) == true) {
      WakeWordBridge.activityRef?.get()?.let { showOverLockScreen(it, true) }
    }
    // Let the rest of the app (expo-router's linking) handle the URL too.
    return false
  }

  companion object {
    fun showOverLockScreen(activity: Activity, show: Boolean) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(show)
        activity.setTurnScreenOn(show)
      } else {
        @Suppress("DEPRECATION")
        val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        if (show) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
      }
    }
  }
}
