package expo.modules.wakeword

import android.Manifest
import android.app.Activity
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class WakeWordModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WakeWord")

    Events("onWake", "onStatus", "onModelProgress")

    OnCreate {
      WakeWordBridge.onWake = { locked ->
        sendEvent("onWake", mapOf("at" to System.currentTimeMillis(), "locked" to locked))
      }
      WakeWordBridge.onStatus = { state, message ->
        sendEvent("onStatus", mapOf("state" to state, "message" to message))
      }
    }

    OnDestroy {
      WakeWordBridge.onWake = null
      WakeWordBridge.onStatus = null
    }

    AsyncFunction("prepareModelAsync") Coroutine { ->
      val ctx = context
      withContext(Dispatchers.IO) {
        try {
          VoskModel.ensure(ctx) { stage, progress ->
            sendEvent("onModelProgress", mapOf("stage" to stage, "progress" to progress))
          }
        } catch (e: Exception) {
          sendEvent("onModelProgress", mapOf("stage" to "error", "progress" to 0.0, "message" to e.message))
          throw CodedException("ERR_MODEL_DOWNLOAD", "Couldn’t download the speech model: ${e.message}", e)
        }
      }
    }

    Function("isModelReady") { VoskModel.isReady(context) }

    AsyncFunction("startAsync") { sensitivity: Double ->
      val ctx = context
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("ERR_NO_MIC", "Microphone permission is needed", null)
      }
      if (!VoskModel.isReady(ctx)) throw CodedException("ERR_NO_MODEL", "The speech model isn’t downloaded yet", null)
      // Higher sensitivity = lower confidence needed per word.
      WakePrefs.setThreshold(ctx, (0.95 - sensitivity.coerceIn(0.0, 1.0) * 0.5).toFloat())
      WakePrefs.setEnabled(ctx, true)
      val running = WakeWordBridge.service
      if (running != null) {
        running.resumeListening()
      } else {
        // Allowed because the app is on screen (Android 14+ "while-in-use" rule).
        ContextCompat.startForegroundService(ctx, Intent(ctx, WakeWordService::class.java))
      }
    }

    AsyncFunction("stopAsync") {
      val ctx = context
      WakePrefs.setEnabled(ctx, false)
      ctx.stopService(Intent(ctx, WakeWordService::class.java))
      WakeNotifications.cancelResumePrompt(ctx)
    }

    Function("getState") { WakeWordBridge.state }
    Function("getStatusMessage") { WakeWordBridge.lastMessage }
    Function("getWakePhrase") { WakePrefs.phrase(context) }
    Function("isEnabled") { WakePrefs.isEnabled(context) }

    Function("pauseListening") {
      WakeWordBridge.service?.pauseListening()
      Unit
    }
    Function("resumeListening") {
      WakeWordBridge.service?.resumeListening()
      Unit
    }

    Function("isDeviceLocked") {
      context.getSystemService(KeyguardManager::class.java)?.isKeyguardLocked == true
    }

    Function("setShowWhenLocked") { show: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread { WakeActivityListener.showOverLockScreen(activity, show) }
    }

    Function("moveToBack") {
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread { activity.moveTaskToBack(true) }
    }

    Function("isIgnoringBatteryOptimizations") {
      val ctx = context
      ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) == true
    }

    Function("openBatteryOptimizationRequest") {
      val ctx = context
      val request = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
      if (!launch(request)) {
        launch(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
      Unit
    }

    Function("canDrawOverlays") { Settings.canDrawOverlays(context) }

    Function("openOverlaySettings") {
      launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT >= 34) {
        context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() == true
      } else {
        true
      }
    }

    Function("openXiaomiAutostart") {
      launch(
        Intent().setComponent(
          ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        ),
      )
    }

    Function("openXiaomiPermissions") {
      launch(
        Intent("miui.intent.action.APP_PERM_EDITOR")
          .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
          .putExtra("extra_pkgname", context.packageName),
      )
    }

    Function("openAppDetails") {
      launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }

    Function("getManufacturer") { Build.MANUFACTURER ?: "" }
  }

  /** Starts a settings screen; false if this phone doesn't have it. */
  private fun launch(intent: Intent): Boolean {
    val activity: Activity? = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (_: ActivityNotFoundException) {
      false
    } catch (_: SecurityException) {
      false
    }
  }
}
