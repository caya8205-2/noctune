package dev.noctune.app

import android.content.Context
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
  private val uiProcessToken = android.os.Binder()

  private val serviceConnection = object : android.content.ServiceConnection {
    override fun onServiceConnected(name: android.content.ComponentName?, service: android.os.IBinder?) {
      sendUiToken()
    }
    override fun onServiceDisconnected(name: android.content.ComponentName?) {}
  }

  private fun sendUiToken() {
    val tokenIntent = Intent(this, MediaPlaybackService::class.java).apply {
      action = "ui_token"
      putExtra("extra_token_bundle", Bundle().apply { putBinder("token", uiProcessToken) })
    }
    runCatching {
      startService(tokenIntent)
    }
  }


  private val dispatchReceiver = object : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val action = intent?.getStringExtra(MediaPlaybackService.EXTRA_ACTION) ?: return
      val wv = currentWebView() ?: return
      val js = "window.dispatchEvent(new CustomEvent('noctune:native-media-action',{detail:{action:'$action'}}));"
      wv.post {
        runCatching { wv.evaluateJavascript(js, null) }
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(true)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    requestNotificationPermission()
    cacheWebView(0)
    pollHandler.post(requestPoller)
    sendUiToken()
    runCatching {
      bindService(
        Intent(this, MediaPlaybackService::class.java),
        serviceConnection,
        Context.BIND_AUTO_CREATE
      )
    }
    val filter = android.content.IntentFilter(MediaPlaybackService.ACTION_DISPATCH)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(dispatchReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(dispatchReceiver, filter)
    }
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

  private var pollTicks = 0
  private var foregroundPending = false
  private var foregroundInFlight = false
  private var initialQueryPending = true
  private var lifecycleGeneration = 0

  private val requestPoller = object : Runnable {
    override fun run() {
      if (isDestroyed) return
      invokeForeground()
      drainRequests(TAKE_REQUEST_JS)
      if (pollTicks++ % 20 == 0) forwardNowPlaying()
      pollHandler.postDelayed(this, 100)
    }
  }

  private fun drainRequests(script: String) {
    currentWebView()?.evaluateJavascript(script) { raw ->
      val requests = runCatching { org.json.JSONArray(raw) }.getOrNull() ?: return@evaluateJavascript
      for (index in 0 until requests.length()) {
        requests.optJSONObject(index)?.let { forwardRequest(it) }
      }
    }
  }

  private fun forwardRequest(request: org.json.JSONObject) {
    // ResultReceiver crosses the UI/:media process boundary; service statics do not.
    val intent = Intent(this, MediaPlaybackService::class.java)
      .setAction(MediaPlaybackService.ACTION_REQUEST)
      .putExtra(MediaPlaybackService.EXTRA_PAYLOAD, request.toString())
    if (request.optString("type") in setOf("handoff", "query", "resume", "set-playing", "stop")) {
      intent.putExtra(MediaPlaybackService.EXTRA_RECEIVER, stateReceiver)
    }
    runCatching {
      if (request.optString("type") == "handoff" && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        startForegroundService(intent)
      } else {
        startService(intent)
      }
    }
  }

  private fun forwardNowPlaying() {
    val webView = currentWebView() ?: return
    webView.evaluateJavascript(NOW_PLAYING_JS) { raw ->
      val payload = runCatching { org.json.JSONObject(raw).put("type", "snapshot") }.getOrNull()
        ?: return@evaluateJavascript
      forwardRequest(payload)
    }
  }

  private val stateReceiver = object : ResultReceiver(Handler(Looper.getMainLooper())) {
    override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
      if (isDestroyed || resultData == null) return
      val webView = currentWebView() ?: return
      val payload = org.json.JSONObject().apply {
        put("requestId", resultData.getString("requestId"))
        put("active", resultData.getBoolean("active"))
        put("playing", resultData.getBoolean("playing"))
        put("buffering", resultData.getBoolean("buffering"))
        put("positionMs", resultData.getLong("positionMs"))
        put("durationMs", resultData.getLong("durationMs"))
        put("trackId", resultData.getString("trackId") ?: "")
        put("streamUrl", resultData.getString("streamUrl") ?: "")
        put("title", resultData.getString("title") ?: "")
        put("artist", resultData.getString("artist") ?: "")
        put("album", resultData.getString("album") ?: "")
        put("artwork", resultData.getString("artwork") ?: "")
        put("error", resultData.getString("error") ?: "")
      }
      val js = "window.__noctune_native_state=$payload;" +
        "window.dispatchEvent(new CustomEvent('noctune:native-state',{detail:$payload}));"
      runCatching { webView.evaluateJavascript(js, null) }
    }
  }

  private fun queryNativeState() {
    forwardRequest(org.json.JSONObject().put("type", "query"))
  }

  private fun invokeForeground() {
    if (!foregroundPending || foregroundInFlight) return
    val webView = currentWebView() ?: return
    foregroundInFlight = true
    val generation = lifecycleGeneration
    webView.evaluateJavascript(FOREGROUND_JS) { ready ->
      foregroundInFlight = false
      if (generation == lifecycleGeneration && ready == "true" && foregroundPending && !isDestroyed) {
        foregroundPending = false
        // Wait for the page's hook, not a fixed boot delay. Never replay delayed
        // unsolicited state after the page has completed its handback.
        if (initialQueryPending) {
          initialQueryPending = false
          queryNativeState()
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    lifecycleGeneration++
    foregroundPending = true
    invokeForeground()
    drainRequests(TAKE_REQUEST_JS)
  }

  override fun onPause() {
    lifecycleGeneration++
    foregroundPending = false
    // Invoke the hook and drain in one JS turn, before Wry pauses the WebView.
    drainRequests(BACKGROUND_AND_TAKE_REQUEST_JS)
    super.onPause()
    currentWebView()?.let { webView ->
      runCatching {
        webView.onResume()
        webView.resumeTimers()
      }
    }
  }

  override fun onDestroy() {
    pollHandler.removeCallbacksAndMessages(null)
    runCatching { unbindService(serviceConnection) }
    runCatching { unregisterReceiver(dispatchReceiver) }
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
    private const val NOW_PLAYING_JS =
      "(function(){try{return window.__noctuneNowPlaying?window.__noctuneNowPlaying():null}catch(e){return null}})()"

    private const val TAKE_REQUEST_JS =
      "(function(){var q=window.__noctune_native_requests;var r=Array.isArray(q)?q.splice(0):[];" +
        "var legacy=window.__noctune_native_request;window.__noctune_native_request=null;" +
        "if(legacy)r.push(legacy);return r;})()"

    private const val BACKGROUND_AND_TAKE_REQUEST_JS =
      "(function(){try{if(typeof window.__noctuneBackground==='function')window.__noctuneBackground();}catch(e){}" +
        "return " + TAKE_REQUEST_JS + ";})()"

    private const val FOREGROUND_JS =
      "(function(){try{if(typeof window.__noctuneForeground==='function'){window.__noctuneForeground();return true;}}" +
        "catch(e){}return false;})()"
  }
}
