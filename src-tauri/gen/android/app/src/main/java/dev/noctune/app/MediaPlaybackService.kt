package dev.noctune.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Keeps the WebView process alive during playback (foreground service) and
 * publishes a system media notification. Android WebView does not promote
 * `navigator.mediaSession` to a notification on its own, so the native side
 * owns the MediaSession and forwards user actions back to the web layer.
 */
class MediaPlaybackService : Service() {

  companion object {
    const val CHANNEL_ID = "noctune_playback"
    const val NOTIFICATION_ID = 4242
    const val ACTION_UPDATE = "dev.noctune.app.media.UPDATE"
    const val ACTION_START = "dev.noctune.app.media.START"
    const val ACTION_STOP = "dev.noctune.app.media.STOP"
    const val ACTION_REQUEST = "dev.noctune.app.media.REQUEST"
    const val ACTION_QUERY_STATE = "dev.noctune.app.media.QUERY_STATE"
    const val EXTRA_RECEIVER = "receiver"
    const val EXTRA_PAYLOAD = "payload"

    private const val NOW_PLAYING_JS =
      "(function(){try{return window.__noctuneNowPlaying?window.__noctuneNowPlaying():null}catch(e){return null}})()"

    private const val TAKE_REQUEST_JS =
      "(function(){try{var r=window.__noctune_native_request;if(r){window.__noctune_native_request=null;return r;}return null;}catch(e){return null;}})()"

    @Volatile
    var webView: WebView? = null

    // Incremented whenever the WebView is detached. Async JS callbacks capture the
    // value they started with and bail out if it changed: a callback that lands
    // after teardown would otherwise touch a destroyed WebView and kill the process.
    @Volatile
    var webViewGeneration = 0

    @Volatile
    var isPlayingNow = false

    @Volatile
    var serviceRunning = false

    fun start(context: Context) {
      val intent = Intent(context, MediaPlaybackService::class.java).setAction(ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    @Volatile
    private var instance: MediaPlaybackService? = null

    fun dispatch(action: String) {
      val wv = webView ?: return
      val js = "window.dispatchEvent(new CustomEvent('noctune:native-media-action',{detail:{action:'$action'}}));"
      wv.post {
        if (webView !== wv) return@post
        runCatching { wv.evaluateJavascript(js, null) }
      }
    }

    /** A fresh activity's WebView replaced the old one: adopt it and resume polling. */
    fun attachWebView(view: WebView) {
      if (webView === view) return
      webView = view
      webViewGeneration += 1
      instance?.startPolling()
    }

    /**
     * The activity and its WebView are going away. Stop polling it: touching a
     * destroyed WebView crashes the whole process natively
     * ("FORTIFY: pthread_mutex_lock called on a destroyed mutex"), which is what
     * killed playback when the task was removed from Recents.
     */
    fun detachWebView() {
      webView = null
      webViewGeneration += 1
      instance?.stopPolling()
    }
  }

  private var session: MediaSessionCompat? = null
  private var playing = false
  private var title = "Noctune"
  private var artist = ""
  private var album = ""
  private var artworkUrl: String? = null
  private var artwork: Bitmap? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private val pollHandler = Handler(Looper.getMainLooper())
  private var pollRunnable: Runnable? = null
  private var pollTicks = 0
  private var player: ExoPlayer? = null
  private var nativeUrl: String? = null
  // Tracks the web player already queued, so the service can keep advancing after
  // the UI process (and its JS queue) is gone.
  private val upNext = ArrayDeque<org.json.JSONObject>()

  @Volatile
  var nativeActive = false
  private var nativeError: String? = null

  private fun acquirePlaybackLocks() {
    runCatching {
      if (wakeLock == null) {
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "noctune:playback").apply {
          setReferenceCounted(false)
          acquire(6 * 60 * 60 * 1000L)
        }
      } else if (wakeLock?.isHeld == false) {
        wakeLock?.acquire(6 * 60 * 60 * 1000L)
      }
    }
    runCatching {
      if (wifiLock == null) {
        val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "noctune:stream").apply {
          setReferenceCounted(false)
          acquire()
        }
      } else if (wifiLock?.isHeld == false) {
        wifiLock?.acquire()
      }
    }
  }

  private fun releasePlaybackLocks() {
    runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
    runCatching { if (wifiLock?.isHeld == true) wifiLock?.release() }
    wakeLock = null
    wifiLock = null
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    serviceRunning = true
    createChannel()
    setupSession()
    // Post the foreground notification immediately: startForegroundService gives
    // the service a few seconds before the system kills it, and metadata from
    // the web layer arrives asynchronously via the poll below.
    startForegroundSafely()
    startPolling()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopPlayback()
        return START_NOT_STICKY
      }
      "play" -> {
        playing = true
        isPlayingNow = true
        acquirePlaybackLocks()
        if (nativeActive) player?.play() else dispatch("play")
        refreshNotification()
      }
      "pause" -> {
        playing = false
        isPlayingNow = false
        releasePlaybackLocks()
        if (nativeActive) player?.pause() else dispatch("pause")
        refreshNotification()
      }
      ACTION_REQUEST -> {
        intent?.getStringExtra(EXTRA_PAYLOAD)?.let { handleRequest(it) }
      }
      ACTION_QUERY_STATE -> replyWithState(intent)
      "next" -> dispatch("next")
      "prev" -> dispatch("prev")
      else -> {
        intent?.getStringExtra(EXTRA_PAYLOAD)?.let { applyPayload(it) }
      }
    }
    if (intent?.action != ACTION_STOP) startForegroundSafely()
    return START_STICKY
  }

  /**
   * Reads the now-playing snapshot straight out of the web layer. This avoids a
   * JavaScript interface, which is only injected into documents registered
   * after addJavascriptInterface and silently never appears in the live page.
   */
  private fun startPolling() {
    if (pollRunnable != null) return
    val runnable = object : Runnable {
      override fun run() {
        pollRequests()
        if (pollTicks++ % 4 == 0) pollNowPlaying()
        pollHandler.postDelayed(this, 500)
      }
    }
    pollRunnable = runnable
    pollHandler.post(runnable)
  }

  private fun pollRequests() {
    val wv = webView ?: return
    if (!wv.isAttachedToWindow) return
    val generation = webViewGeneration
    wv.evaluateJavascript(TAKE_REQUEST_JS) { raw ->
      if (generation != webViewGeneration) return@evaluateJavascript
      if (raw.isNullOrBlank() || raw == "null") return@evaluateJavascript
      handleRequest(raw)
    }
  }

  /**
   * The web layer queues native playback commands on a plain global, so no
   * JavaScript interface (which never reliably reaches the loaded document) is
   * required. Used to hand playback over to ExoPlayer when the app is
   * backgrounded, where Chromium suspends the HTML audio element.
   */
  private fun handleRequest(raw: String) {
    val json = runCatching { JSONObject(raw) }.getOrNull() ?: return
    when (json.optString("type")) {
      "handoff" -> {
        val url = json.optString("url")
        val position = json.optLong("positionMs", 0L)
        if (url.isNotBlank()) startNativePlayback(url, position)
      }
      "resume" -> {
        val position = stopNativePlayback()
        webView?.evaluateJavascript("window.__noctune_native_position=$position", null)
      }
      "stop" -> {
        stopNativePlayback()
      }
      "snapshot" -> {
        applyPayload(raw)
      }
      "download" -> {
        NoctuneDownloads.enqueue(
          this,
          json.optString("url"),
          json.optString("filename")
        )
      }
    }
  }

  private fun ensurePlayer(): ExoPlayer {
    player?.let { return it }
    val created = ExoPlayer.Builder(this).build()
    created.addListener(object : Player.Listener {
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (nativeActive) {
          playing = isPlaying
          isPlayingNow = isPlaying
          refreshNotification()
        }
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState != Player.STATE_ENDED) return
        val next = upNext.removeFirstOrNull()
        if (next != null) {
          val url = next.optString("url")
          title = next.optString("title", title)
          artist = next.optString("artist", artist)
          val art = next.optString("artwork")
          if (art.isNotBlank()) artworkUrl = art
          nativeUrl = null
          startNativePlayback(url, 0L)
          refreshNotification()
        } else {
          dispatch("next")
        }
      }
    })
    player = created
    return created
  }

  private fun startNativePlayback(url: String, positionMs: Long) {
    try {
      val exo = ensurePlayer()
      nativeActive = true
      if (nativeUrl != url) {
        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()
        nativeUrl = url
      }
      exo.seekTo(positionMs)
      exo.playWhenReady = true
      acquirePlaybackLocks()
      refreshNotification()
      nativeError = null
    } catch (err: Exception) {
      nativeError = "${err.javaClass.simpleName}: ${err.message}"
      nativeActive = false
    }
  }

  private fun stopNativePlayback(): Long {
    val exo = player ?: return 0L
    val position = runCatching { exo.currentPosition }.getOrDefault(0L)
    runCatching {
      exo.pause()
      exo.stop()
      exo.clearMediaItems()
    }
    nativeUrl = null
    nativeActive = false
    refreshNotification()
    return if (position > 0) position else 0L
  }

  private fun stopPolling() {
    pollRunnable?.let { pollHandler.removeCallbacks(it) }
    pollRunnable = null
  }

  private fun pollNowPlaying() {
    val wv = webView ?: return
    // Keep the web layer unpaused: WryActivity pauses the WebView whenever the
    // activity does, which suspends media. Re-asserting resume here (service
    // side, independent of the activity lifecycle) keeps playback alive.
    // Every posted block re-checks that this WebView is still the attached one:
    // a block queued before teardown otherwise runs against a destroyed WebView
    // and crashes the process ("FORTIFY: pthread_mutex_lock ... destroyed mutex").
    wv.post {
      if (webView !== wv) return@post
      runCatching {
        wv.onResume()
        wv.resumeTimers()
      }
    }
    if (webView !== wv) return
    val generation = webViewGeneration
    wv.evaluateJavascript(NOW_PLAYING_JS) { raw ->
      if (generation != webViewGeneration) return@evaluateJavascript
      if (raw.isNullOrBlank() || raw == "null" || raw.length < 4) return@evaluateJavascript
      applyPayload(raw)
    }
    publishNativeState(wv)
  }

  private fun publishNativeState(wv: WebView) {
    val exo = player
    val payload = runCatching {
      JSONObject()
        .put("active", nativeActive)
        .put("playing", exo?.isPlaying ?: false)
        .put("state", exo?.playbackState ?: -1)
        .put("pos", exo?.currentPosition ?: 0L)
        .put("err", nativeError ?: "")
        .toString()
    }.getOrNull() ?: return
    if (webView !== wv) return
    wv.evaluateJavascript("window.__noctune_native_state=$payload", null)
  }

  private fun startForegroundSafely() {
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (err: Exception) {
      // Missing POST_NOTIFICATIONS or FGS start restriction: keep the service
      // alive silently instead of crashing the player.
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Playback",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Media playback controls"
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  private fun setupSession() {
    val mediaSession = MediaSessionCompat(this, "NoctuneMediaSession").apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          playing = true
          isPlayingNow = true
          acquirePlaybackLocks()
          // With the activity gone there is no JS to drive, so control ExoPlayer
          // directly; otherwise keep the web player as the source of truth.
          if (nativeActive) player?.play() else dispatch("play")
          refreshNotification()
        }

        override fun onPause() {
          playing = false
          isPlayingNow = false
          releasePlaybackLocks()
          if (nativeActive) player?.pause() else dispatch("pause")
          refreshNotification()
        }

        override fun onSkipToNext() = dispatch("next")
        override fun onSkipToPrevious() = dispatch("prev")
        // No onStop override: the system invokes onStop when the task is removed
        // from Recents, and tearing playback down there killed the service. It then
        // could not re-enter foreground from the background (Android 12 denies
        // "Background started FGS"), so the music died with the swipe.
      })
      isActive = true
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
      )
    }
    session = mediaSession
  }

  private fun applyPayload(raw: String) {
    val json = runCatching { JSONObject(raw) }.getOrNull() ?: return
    playing = json.optBoolean("playing", playing)
    isPlayingNow = playing
    if (playing) acquirePlaybackLocks() else releasePlaybackLocks()

    // Track changed while the app is in the background: the web player keeps
    // advancing the queue with a paused element, so native has to follow the new
    // stream URL, otherwise ExoPlayer stays parked on the finished track.
    if (nativeActive) {
      val nextUrl = json.optString("streamUrl").trim()
      if (nextUrl.isNotEmpty() && nextUrl != nativeUrl) {
        startNativePlayback(nextUrl, 0L)
      }
    }

    title = json.optString("title", title).ifBlank { "Noctune" }
    artist = json.optString("artist", artist)
    album = json.optString("album", album)
    val nextArtwork = json.optString("artwork", "").ifBlank { null }

    if (nextArtwork != artworkUrl) {
      artworkUrl = nextArtwork
      artwork = null
      if (nextArtwork != null) loadArtwork(nextArtwork)
    }

    // Refresh the queue horizon the service can walk on its own.
    json.optJSONArray("upNext")?.let { array ->
      upNext.clear()
      for (i in 0 until array.length()) {
        val entry = array.optJSONObject(i) ?: continue
        if (entry.optString("url").isNotBlank()) upNext.addLast(entry)
      }
    }
    publishState()
    refreshNotification()
  }

  private fun loadArtwork(url: String) {
    Thread {
      val bitmap = runCatching {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 5000
        connection.readTimeout = 5000
        connection.inputStream.use { BitmapFactory.decodeStream(it) }
      }.getOrNull()
      if (bitmap != null) {
        artwork = bitmap
        refreshNotification()
      }
    }.start()
  }

  private fun publishState() {
    val mediaSession = session ?: return
    val durationMs = 0L
    mediaSession.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
        .apply { artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
        .build()
    )
    mediaSession.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_STOP
        )
        .setState(
          if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
          PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
          if (playing) 1f else 0f
        )
        .build()
    )
  }

  private fun buildNotification(): Notification {
    val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    fun actionIntent(action: String, code: Int): PendingIntent {
      val intent = Intent(this, MediaPlaybackService::class.java).setAction(action)
      return PendingIntent.getService(
        this,
        code,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_noctune)
      .setContentTitle(title)
      .setContentText(artist.ifBlank { album })
      .setContentIntent(contentIntent)
      .setOngoing(playing)
      .setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(R.drawable.ic_media_prev, "Previous", actionIntent("prev", 1))
      .addAction(
        if (playing) R.drawable.ic_media_pause else R.drawable.ic_media_play,
        if (playing) "Pause" else "Play",
        actionIntent(if (playing) "pause" else "play", 2)
      )
      .addAction(R.drawable.ic_media_next, "Next", actionIntent("next", 3))

    artwork?.let { builder.setLargeIcon(it) }

    val mediaStyle = MediaStyle()
      .setMediaSession(session?.sessionToken)
      .setShowActionsInCompactView(0, 1, 2)

    return builder.setStyle(mediaStyle).build()
  }

  private fun refreshNotification() {
    runCatching {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, buildNotification())
    }
  }

  private fun stopPlayback() {
    playing = false
    isPlayingNow = false
    serviceRunning = false
    stopPolling()
    releasePlaybackLocks()
    runCatching { session?.isActive = false }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  /**
   * Answers MainActivity with the native playback state. The service lives in its
   * own process, so the page cannot read these fields directly.
   */
  private fun replyWithState(intent: Intent) {
    @Suppress("DEPRECATION")
    val receiver = intent.getParcelableExtra<android.os.ResultReceiver>(EXTRA_RECEIVER) ?: return
    val bundle = android.os.Bundle().apply {
      putBoolean("active", nativeActive)
      putBoolean("playing", player?.isPlaying ?: false)
      putLong("positionMs", runCatching { player?.currentPosition ?: 0L }.getOrDefault(0L))
      putLong("durationMs", runCatching { player?.duration ?: 0L }.getOrDefault(0L))
      putString("title", title)
      putString("artist", artist)
      putString("artwork", artworkUrl ?: "")
    }
    receiver.send(0, bundle)
  }

  /**
   * The user swiped the app out of Recents. Keep the audio session and its
   * notification alive: stopping here means Android later refuses to bring the
   * service back to the foreground ("Background started FGS: Disallowed").
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    runCatching { refreshNotification() }
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    instance = null
    serviceRunning = false
    stopPolling()
    runCatching { player?.release() }
    player = null
    nativeActive = false
    runCatching { session?.release() }
    session = null
    super.onDestroy()
  }
}
