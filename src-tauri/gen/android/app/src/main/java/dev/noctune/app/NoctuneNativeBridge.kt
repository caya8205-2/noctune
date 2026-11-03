package dev.noctune.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.webkit.JavascriptInterface

/**
 * JS bridge exposed to the web layer as `window.NoctuneNative`.
 * The web app pushes now-playing metadata here so the native foreground
 * service can render the system media notification and keep playback alive.
 */
class NoctuneNativeBridge(private val context: Context) {

  @JavascriptInterface
  fun updateMedia(payload: String) {
    send(payload)
  }

  @JavascriptInterface
  fun stopMedia() {
    val intent = Intent(context, MediaPlaybackService::class.java).setAction(MediaPlaybackService.ACTION_STOP)
    runCatching { context.startService(intent) }
  }

  private fun send(payload: String) {
    val intent = Intent(context, MediaPlaybackService::class.java).apply {
      action = MediaPlaybackService.ACTION_UPDATE
      putExtra(MediaPlaybackService.EXTRA_PAYLOAD, payload)
    }
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }
  }
}
