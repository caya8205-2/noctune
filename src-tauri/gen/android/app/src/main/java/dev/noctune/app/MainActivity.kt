package dev.noctune.app

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(true)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    requestNotificationPermission()
    attachMediaBridgeWithRetry(0)
  }

  private fun attachMediaBridgeWithRetry(attempt: Int) {
    val webView = findWebView(window.decorView)
    if (webView != null) {
      MediaPlaybackService.webView = webView
      val attached = runCatching {
        webView.addJavascriptInterface(NoctuneNativeBridge(applicationContext), "NoctuneNative")
        true
      }.getOrDefault(false)
      android.util.Log.i("Noctune", "media bridge attached=$attached attempt=$attempt")
      return
    }
    if (attempt < 20) {
      window.decorView.postDelayed({ attachMediaBridgeWithRetry(attempt + 1) }, 250)
    } else {
      android.util.Log.w("Noctune", "media bridge: webview not found after retries")
    }
  }

  override fun onPause() {
    super.onPause()
    // WryActivity.onPause() calls WebView.onPause(), which halts media
    // playback. While a track is playing the web layer must keep running so
    // audio survives backgrounding, so immediately resume the WebView.
    if (MediaPlaybackService.isPlayingNow) {
      val wv = MediaPlaybackService.webView
      wv?.post {
        runCatching {
          wv.onResume()
          wv.resumeTimers()
        }
      }
    }
  }

  private fun requestNotificationPermission() {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
      if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
        requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
      }
    }
  }

  private fun attachMediaBridge() {
    val webView = findWebView(window.decorView) ?: return
    MediaPlaybackService.webView = webView
    runCatching { webView.addJavascriptInterface(NoctuneNativeBridge(applicationContext), "NoctuneNative") }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        val found = findWebView(view.getChildAt(index))
        if (found != null) return found
      }
    }
    return null
  }
}
