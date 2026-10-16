package expo.modules.wakeword

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android 14+ forbids starting a microphone service at boot, so if "Hey Nova" was
 * on before the restart, post a notification; tapping it opens Nova, which starts
 * listening again while it is on screen (spec 9.2: "where the OS allows").
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    if (WakePrefs.isEnabled(context)) WakeNotifications.showResumePrompt(context)
  }
}
