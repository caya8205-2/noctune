package dev.noctune.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ResultReceiver
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
    if (found != null) {
      applyAppWebSettings(found)
    }
    return found
  }

  /**
   * Noctune renders a fixed app shell (header, player bar). Pinch zoom leaves
   * those layers misaligned, so zoom is disabled at the WebView level as well as
   * through the viewport meta tag.
   */
  private fun applyAppWebSettings(webView: WebView) {
    webView.setBackgroundColor(android.graphics.Color.parseColor("#0B0E14"))
    val settings = webView.settings
    settings.setSupportZoom(false)
    settings.builtInZoomControls = false
    settings.displayZoomControls = false
    settings.mediaPlaybackRequiresUserGesture = false
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

  /**
   * Picks up web-layer requests that do not need the media service (currently
   * device downloads). The service polls the same channel while it is alive and
   * whichever poller takes the request first handles it.
   */
  private var pollTicks = 0

  private val requestPoller = object : Runnable {
    override fun run() {
      pollTicks++
      if (pollTicks % 3 == 0) forwardNowPlaying()
      currentWebView()?.evaluateJavascript(TAKE_REQUEST_JS) { raw ->
        if (!raw.isNullOrBlank() && raw != "null") {
          val json = runCatching { org.json.JSONObject(raw) }.getOrNull()
          if (json != null) {
            // The media service lives in its own process (:media) so a WebView
            // teardown cannot take audio down with it — requests travel by Intent.
            ensureMediaService()
            val intent = Intent(this@MainActivity, MediaPlaybackService::class.java)
              .setAction(MediaPlaybackService.ACTION_REQUEST)
              .putExtra(MediaPlaybackService.EXTRA_PAYLOAD, json.toString())
            runCatching { startService(intent) }
          }
        }
      }
      pollHandler.postDelayed(this, 700)
    }
  }

  private fun forwardNowPlaying() {
    val webView = currentWebView() ?: return
    webView.evaluateJavascript(NOW_PLAYING_JS) { raw ->
      if (raw.isNullOrBlank() || raw == "null" || raw.length < 4) return@evaluateJavascript
      val payload = runCatching { org.json.JSONObject(raw).put("type", "snapshot").toString() }.getOrNull() ?: return@evaluateJavascript
      val intent = Intent(this@MainActivity, MediaPlaybackService::class.java)
        .setAction(MediaPlaybackService.ACTION_REQUEST)
        .putExtra(MediaPlaybackService.EXTRA_PAYLOAD, payload)
      runCatching { startService(intent) }
    }
  }

  /**
   * Asks the :media process where playback actually is and mirrors the answer into
   * the page. The service cannot write to the WebView itself (different process).
   */
  private fun queryNativeState() {
    val receiver = object : ResultReceiver(Handler(Looper.getMainLooper())) {
      override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
        val webView = currentWebView() ?: return
        val payload = org.json.JSONObject().apply {
          put("active", resultData?.getBoolean("active") ?: false)
          put("playing", resultData?.getBoolean("playing") ?: false)
          put("positionMs", resultData?.getLong("positionMs") ?: 0L)
          put("durationMs", resultData?.getLong("durationMs") ?: 0L)
          put("trackId", resultData?.getString("trackId") ?: "")
          put("streamUrl", resultData?.getString("streamUrl") ?: "")
          put("title", resultData?.getString("title") ?: "")
          put("artist", resultData?.getString("artist") ?: "")
          put("album", resultData?.getString("album") ?: "")
          put("artwork", resultData?.getString("artwork") ?: "")
        }
        val js = "window.__noctune_native_state=$payload;" +
          "window.dispatchEvent(new CustomEvent('noctune:native-state',{detail:$payload}));"
        runCatching { webView.evaluateJavascript(js, null) }
      }
    }
    val intent = Intent(this, MediaPlaybackService::class.java)
      .setAction(MediaPlaybackService.ACTION_QUERY_STATE)
      .putExtra(MediaPlaybackService.EXTRA_RECEIVER, receiver)
    runCatching { startService(intent) }
  }

  private val statePoller = object : Runnable {
    override fun run() {
      evaluatePlaybackState { playing -> if (playing) ensureMediaService() }
      pollHandler.postDelayed(this, 4000)
    }
  }

  override fun onResume() {
    super.onResume()
    // The page needs a moment to boot before it can receive the native state, so
    // ask again shortly after the first attempt.
    queryNativeState()
    pollHandler.postDelayed({ queryNativeState() }, 1500)
    pollHandler.postDelayed({ queryNativeState() }, 4000)
    pollHandler.post(statePoller)
    pollHandler.removeCallbacks(requestPoller)
    pollHandler.post(requestPoller)
  }

  override fun onPause() {
    pollHandler.removeCallbacks(statePoller)
    // Instantly process any queued background handoff request before the OS suspends WebView
    currentWebView()?.evaluateJavascript(TAKE_REQUEST_JS) { raw ->
      if (!raw.isNullOrBlank() && raw != "null") {
        val json = runCatching { org.json.JSONObject(raw) }.getOrNull()
        if (json != null) {
          ensureMediaService()
          val intent = Intent(this@MainActivity, MediaPlaybackService::class.java)
            .setAction(MediaPlaybackService.ACTION_REQUEST)
            .putExtra(MediaPlaybackService.EXTRA_PAYLOAD, json.toString())
          runCatching { startService(intent) }
        }
      }
    }
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

  override fun onDestroy() {
    pollHandler.removeCallbacksAndMessages(null)
    super.onDestroy()
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

    private const val NOW_PLAYING_JS =
      "(function(){try{return window.__noctuneNowPlaying?window.__noctuneNowPlaying():null}catch(e){return null}})()"

    private const val TAKE_REQUEST_JS =
      "(function(){try{var r=window.__noctune_native_request;if(r){window.__noctune_native_request=null;return r;}return null;}catch(e){return null;}})()"
  }
}
