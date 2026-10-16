package expo.modules.wakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object WakeNotifications {
  const val LISTENING_ID = 4201
  private const val WAKE_ID = 4202
  private const val RESUME_ID = 4203
  private const val CHANNEL_LISTENING = "nova_wake_listening"
  private const val CHANNEL_ALERTS = "nova_wake_alerts"
  private val ICON = android.R.drawable.ic_btn_speak_now

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_LISTENING, "Hey Nova listening", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while Nova listens for “Hey Nova”."
        setShowBadge(false)
      },
    )
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ALERTS, "Hey Nova", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Opens Nova when you say “Hey Nova”, and reminders to turn listening back on."
      },
    )
  }

  /** Intent that opens a nova:// link inside this app. */
  fun appLink(context: Context, uri: String, wake: Boolean = false): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(uri))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra(WakeWordBridge.EXTRA_WAKE, wake)

  private fun pending(context: Context, requestCode: Int, intent: Intent): PendingIntent =
    PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** The permanent notification of the listening service (spec 9.2). */
  fun listening(context: Context, phrase: String, paused: Boolean): Notification {
    ensureChannels(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    val title = if (paused) "Nova is answering" else "Nova is listening"
    val spoken = phrase.split(' ').joinToString(" ") { word -> word.replaceFirstChar { c -> c.uppercaseChar() } }
    val text = "Say “$spoken”"
    return NotificationCompat.Builder(context, CHANNEL_LISTENING)
      .setSmallIcon(ICON)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setContentIntent(pending(context, 0, launch))
      .build()
  }

  /** Opens the voice screen over the lock screen when a direct launch isn't allowed. */
  fun showWake(context: Context, intent: Intent) {
    ensureChannels(context)
    val content = pending(context, 1, intent)
    val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
      .setSmallIcon(ICON)
      .setContentTitle("Nova")
      .setContentText("I’m listening…")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setFullScreenIntent(content, true)
      .setContentIntent(content)
      .setAutoCancel(true)
      .setTimeoutAfter(60_000)
      .build()
    notify(context, WAKE_ID, notification)
  }

  /** After a reboot or when the system stopped the service: tap to resume listening. */
  fun showResumePrompt(context: Context) {
    ensureChannels(context)
    val content = pending(context, 2, appLink(context, WakeWordBridge.RESUME_URI))
    val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
      .setSmallIcon(ICON)
      .setContentTitle("“Hey Nova” is paused")
      .setContentText("Tap to start listening again.")
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setContentIntent(content)
      .setAutoCancel(true)
      .build()
    notify(context, RESUME_ID, notification)
  }

  fun cancelWake(context: Context) {
    NotificationManagerCompat.from(context).cancel(WAKE_ID)
  }

  fun cancelResumePrompt(context: Context) {
    NotificationManagerCompat.from(context).cancel(RESUME_ID)
  }

  private fun notify(context: Context, id: Int, notification: Notification) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    try {
      manager.notify(id, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS not granted.
    }
  }
}
