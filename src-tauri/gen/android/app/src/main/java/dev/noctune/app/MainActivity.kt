package dev.noctune.app

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private val pollHandler = Handler(Looper.getMainLooper())


  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(true)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    requestNotificationPermission()
    cacheWebView(0)
  }

  /**
   * The web layer exposes `window.__noctuneIsPlaying` / `window.__noctuneNowPlaying`.
   * Native reads them through evaluateJavascript instead of addJavascriptInterface,
   * which only reaches documents created after registration and silently fails
   * when the WebView is created or swapped late.
   */
  private fun currentWebView(): WebView? {
    MediaPlaybackService.webView?.let { return it }
    val found = findWebView(window.decorView)
    if (found != null) MediaPlaybackService.webView = found
    return found
  }

  private fun cacheWebView(attempt: Int) {
    if (currentWebView() != null) return
    if (attempt < 20) {
      window.decorView.postDelayed({ cacheWebView(attempt + 1) }, 250)
    }
  }

  private fun evaluatePlaybackState(onResult: (Boolean) -> Unit) {
    val webView = currentWebView()
    if (webView == null) {
      onResult(false)
      return
    }
    webView.evaluateJavascript(IS_PLAYING_JS) { value ->
      onResult(value?.trim()?.trim('"') == "true")
    }
  }

  private fun ensureMediaService() {
    if (!MediaPlaybackService.serviceRunning) {
      runCatching { MediaPlaybackService.start(this) }
    }
  }

  override fun onResume() {
    super.onResume()
    val runnable = object : Runnable {
      override fun run() {
        evaluatePlaybackState { playing -> if (playing) ensureMediaService() }
        pollHandler.postDelayed(this, 4000)
      }
    }
    pollHandler.post(runnable)
  }

  override fun onPause() {
    pollHandler.removeCallbacksAndMessages(null)
    super.onPause()

    // WryActivity.onPause() calls WebView.onPause(). Chromium keeps suspending
    // the HTMLMediaElement while the page is hidden even when that call is
    // suppressed, so this only resumes the web layer and hands the session to
    // the foreground service (notification + wake locks). Playback survival in
    // the background needs native playback, not a WebView trick.
    val webView = currentWebView() ?: return
    runCatching {
      webView.onResume()
      webView.resumeTimers()
    }
    webView.evaluateJavascript(IS_PLAYING_JS) { value ->
      if (value?.trim()?.trim('"') == "true") {
        ensureMediaService()
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

  companion object {
    private const val IS_PLAYING_JS =
      "(function(){try{return window.__noctuneIsPlaying?window.__noctuneIsPlaying():false}catch(e){return false}})()"
  }
}
