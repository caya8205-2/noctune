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
import android.os.Bundle
import android.os.ResultReceiver
import android.util.Log
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
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Owns background audio in :media; the foreground WebView exchanges commands by Intent. */
class MediaPlaybackService : Service() {

  companion object {
    private const val TAG = "NoctunePlayback"
    const val CHANNEL_ID = "noctune_playback"
    const val NOTIFICATION_ID = 4242
    const val ACTION_UPDATE = "dev.noctune.app.media.UPDATE"
    const val ACTION_START = "dev.noctune.app.media.START"
    const val ACTION_STOP = "dev.noctune.app.media.STOP"
    const val ACTION_REQUEST = "dev.noctune.app.media.REQUEST"
    const val ACTION_QUERY_STATE = "dev.noctune.app.media.QUERY_STATE"
    const val ACTION_DISPATCH = "dev.noctune.app.media.DISPATCH"
    const val EXTRA_ACTION = "action"
    const val EXTRA_RECEIVER = "receiver"
    const val EXTRA_PAYLOAD = "payload"

    private const val NOW_PLAYING_JS =
      "(function(){try{return window.__noctuneNowPlaying?window.__noctuneNowPlaying():null}catch(e){return null}})()"

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
      val inst = instance
      if (inst != null) {
        val intent = Intent(ACTION_DISPATCH).apply {
          setPackage(inst.packageName)
          putExtra(EXTRA_ACTION, action)
        }
        inst.sendBroadcast(intent)
      }
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
  private var trackId = ""
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
  // Joined live muxes (Spotify Direct) start their own timeline at the join
  // point; the handoff position is the absolute offset to add back on top.
  private var joinedOffsetMs = 0L
  private var lastNativePositionMs: Long = 0L
  // Tracks the web player already queued, so the service can keep advancing after
  // the UI process (and its JS queue) is gone.
  private val upNext = ArrayDeque<JSONObject>()
  private val playedHistory = ArrayDeque<JSONObject>()
  private var durationMs = 0L
  private var playbackRate = 1f
  private var playbackVolume = 1f
  private var repeatMode = "off"

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
      "play" -> setPlaying(true)
      "pause" -> setPlaying(false)
      ACTION_REQUEST -> {
        intent.getStringExtra(EXTRA_PAYLOAD)?.let { handleRequest(it, intent) }
      }
      ACTION_QUERY_STATE -> replyWithState(intent, intent.getStringExtra("requestId"))
      "next" -> nextTrack()
      "prev" -> previousTrack()
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
        if (pollTicks++ % 4 == 0) pollNowPlaying()
        pollHandler.postDelayed(this, 500)
      }
    }
    pollRunnable = runnable
    pollHandler.post(runnable)
  }

  private fun handleRequest(raw: String, intent: Intent) {
    val json = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val requestId = json.opt("requestId") as? String
    try {
      when (json.optString("type")) {
        "handoff" -> {
          val incomingId = json.optString("trackId")
          val duplicate = nativeActive
          Log.d(TAG, "handoff track=$incomingId duplicate=$duplicate")
          if (!duplicate) {
            val url = json.optString("url")
            require(url.isNotBlank()) { "Missing handoff URL" }
            readTrack(json)
            playbackRate = json.optDouble("playbackRate", 1.0).toFloat()
              .takeIf { it.isFinite() && it > 0f } ?: 1f
            playbackVolume = json.optDouble("volume", 1.0).toFloat()
              .takeIf { it.isFinite() }?.coerceIn(0f, 1f) ?: 1f
            repeatMode = json.optString("repeat", "off")
            upNext.clear()
            playedHistory.clear()
            json.optJSONArray("upNext")?.let { array ->
              for (index in 0 until array.length()) {
                val entry = array.optJSONObject(index) ?: continue
                if (entry.optString("url").isNotBlank()) upNext.addLast(entry)
              }
            }
            startNativePlayback(
              url,
              json.optLong("positionMs", 0L).coerceAtLeast(0L),
              !json.optBoolean("paused", false) && json.optBoolean("playing", true)
            )
          }
        }
        "query" -> Unit
        "resume" -> {
          val matches = json.opt("trackId") is String && json.optString("trackId") == trackId
          Log.d(TAG, "resume track=$trackId matches=$matches active=$nativeActive")
          if (nativeActive && matches) stopNativePlayback(transferToWeb = true)
        }
        "stop" -> stopNativePlayback()
        "set-playing" -> if (json.has("playing")) setPlaying(json.optBoolean("playing"))
        "snapshot" -> applyPayload(raw)
        "download" -> NoctuneDownloads.enqueue(this, json.optString("url"), json.optString("filename"))
      }
    } catch (err: Exception) {
      nativeError = err.javaClass.simpleName
    }
    // Acknowledge only after mutation. Queries and mismatched resumes never stop audio.
    replyWithState(intent, requestId)
  }

  private fun readTrack(json: JSONObject) {
    val metadata = json.optJSONObject("metadata") ?: json
    trackId = json.optString("trackId", json.optString("id", ""))
    title = metadata.optString("title").ifBlank { "Noctune" }
    artist = metadata.optString("artist")
    album = metadata.optString("album")
    durationMs = json.optLong("durationMs", metadata.optLong("durationMs", 0L)).coerceAtLeast(0L)
    val nextArtwork = metadata.optString("artwork").ifBlank { null }
    if (nextArtwork != artworkUrl) {
      artworkUrl = nextArtwork
      artwork = null
      if (nextArtwork != null) loadArtwork(nextArtwork)
    }
  }

  private fun currentTrack(): JSONObject = JSONObject()
    .put("trackId", trackId)
    .put("url", nativeUrl ?: "")
    .put("title", title)
    .put("artist", artist)
    .put("album", album)
    .put("artwork", artworkUrl ?: "")
    .put("durationMs", currentDurationMs())

  private fun nextTrack(naturalEnd: Boolean = false) {
    if (!nativeActive) {
      if (!naturalEnd) dispatch("next")
      return
    }
    val shouldPlay = player?.playWhenReady == true
    if (naturalEnd && repeatMode == "one") {
      player?.seekTo(0L)
      syncNativePlaybackState()
      return
    }
    val next = upNext.removeFirstOrNull()
    if (next == null) {
      Log.d(TAG, "queue exhausted track=$trackId")
      player?.pause()
      syncNativePlaybackState()
      return
    }
    playedHistory.addLast(currentTrack())
    while (playedHistory.size > 20) playedHistory.removeFirst()
    readTrack(next)
    Log.d(TAG, "queue advance track=$trackId remaining=${upNext.size}")
    startNativePlayback(next.optString("url"), 0L, shouldPlay)
  }

  private fun previousTrack() {
    if (!nativeActive) {
      dispatch("prev")
      return
    }
    if (currentPositionMs() > 3000L || playedHistory.isEmpty()) {
      player?.seekTo(0L)
      syncNativePlaybackState()
      return
    }
    val previous = playedHistory.removeLast()
    val shouldPlay = player?.playWhenReady == true
    upNext.addFirst(currentTrack())
    readTrack(previous)
    Log.d(TAG, "queue previous track=$trackId remaining=${upNext.size}")
    startNativePlayback(previous.optString("url"), 0L, shouldPlay)
  }

  private fun setPlaying(value: Boolean) {
    if (nativeActive) {
      player?.let { exo ->
        if (value && exo.playerError != null) {
          nativeError = null
          exo.prepare()
        }
        exo.playWhenReady = value
      }
      syncNativePlaybackState()
    } else {
      // Wait for a web snapshot instead of claiming a sleeping WebView is playing.
      dispatch(if (value) "play" else "pause")
    }
  }

  private fun syncNativePlaybackState() {
    if (!nativeActive) return
    playing = player?.playWhenReady == true
    isPlayingNow = playing
    if (playing) acquirePlaybackLocks() else releasePlaybackLocks()
    refreshNotification()
  }

  private fun ensurePlayer(): ExoPlayer {
    player?.let { return it }
    val created = ExoPlayer.Builder(this).build()
    created.addListener(object : Player.Listener {
      override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
        syncNativePlaybackState()
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        if (!nativeActive) return
        if (playbackState == Player.STATE_ENDED && player?.playbackState == Player.STATE_ENDED) {
          nextTrack(naturalEnd = true)
        } else {
          syncNativePlaybackState()
        }
      }

      override fun onPlayerError(error: PlaybackException) {
        if (!nativeActive) return
        nativeError = error.errorCodeName
        if (!watchdogRetried) {
          watchdogRetried = true
          Log.w(TAG, "player error ${error.errorCodeName}, retrying without live join")
          val resumeAt = currentPositionMs()
          runCatching {
            player?.stop()
            player?.clearMediaItems()
          }
          startNativePlayback(withoutJoin(nativeUrl ?: ""), resumeAt, true)
          return
        }
        Log.w(TAG, "player error ${error.errorCodeName} after retry, releasing native ownership")
        giveUpNative()
      }
    })
    player = created
    return created
  }

  private fun startNativePlayback(url: String, positionMs: Long, shouldPlay: Boolean) {
    nativeError = null
    nativeUrl = url
    lastNativePositionMs = positionMs
    try {
      val exo = ensurePlayer()
      nativeActive = true
      // join=1 is meaningful only for Spotify Direct live muxes; seekable
      // streams (YouTube proxy, RAM-cached Spotify) honor the position directly.
      val liveJoin = url.contains("join=1") && url.contains("/player/stream/spotify:")
      joinedOffsetMs = if (liveJoin) positionMs else 0L
      calibratePending = liveJoin
      calibrateExpectedMs = positionMs
      watchdogRetried = false
      stallCount = 0
      lastWatchdogPos = -1L
      exo.setMediaItem(MediaItem.fromUri(url), positionMs)
      exo.setPlaybackSpeed(playbackRate)
      exo.volume = playbackVolume
      exo.playWhenReady = shouldPlay
      exo.prepare()
      syncNativePlaybackState()
      pollHandler.postDelayed(calibrateRunnable, 2500)
      pollHandler.postDelayed(watchdogRunnable, 4000)
    } catch (err: Exception) {
      nativeError = err.javaClass.simpleName
      nativeActive = false
      stopNativePlayback()
    }
  }

  // A joined live mux rebases its timeline to zero; a seekable stream reports
  // absolute positions. Decide which one we got once the player has started.
  private val calibrateRunnable = Runnable {
    if (!nativeActive || !calibratePending) return@Runnable
    calibratePending = false
    val pos = player?.currentPosition ?: 0L
    if (pos > calibrateExpectedMs / 2) joinedOffsetMs = 0L
  }

  // Dead-stream watchdog: a playing player whose position never advances is a
  // wedged upstream. Retry once without the join marker, then release native
  // ownership so handoff and foreground queries stop trusting a corpse.
  private var watchdogRetried = false
  private var stallCount = 0
  private var lastWatchdogPos = -1L
  private var calibratePending = false
  private var calibrateExpectedMs = 0L

  private val watchdogRunnable = object : Runnable {
    override fun run() {
      if (!nativeActive) return
      val exo = player
      if (exo != null && exo.playWhenReady) {
        val pos = exo.currentPosition
        stallCount = if (pos == lastWatchdogPos) stallCount + 1 else 0
        lastWatchdogPos = pos
        if (stallCount >= 2) {
          stallCount = 0
          if (!watchdogRetried) {
            watchdogRetried = true
            Log.w(TAG, "stream stalled, retrying without live join")
            val resumeAt = currentPositionMs()
            runCatching {
              exo.stop()
              exo.clearMediaItems()
            }
            startNativePlayback(withoutJoin(nativeUrl ?: ""), resumeAt, true)
            return
          }
          Log.w(TAG, "stream stalled again, releasing native ownership")
          nativeError = "StreamStalled"
          giveUpNative()
          return
        }
      }
      pollHandler.postDelayed(this, 4000)
    }
  }

  private fun withoutJoin(url: String): String =
    url.replace("&join=1", "").replace("?join=1", "")

  private fun giveUpNative() {
    lastNativePositionMs = currentPositionMs()
    durationMs = currentDurationMs()
    nativeActive = false
    joinedOffsetMs = 0L
    pollHandler.removeCallbacks(watchdogRunnable)
    pollHandler.removeCallbacks(calibrateRunnable)
    runCatching {
      player?.pause()
      player?.stop()
      player?.clearMediaItems()
    }
    playing = false
    isPlayingNow = false
    releasePlaybackLocks()
    refreshNotification()
  }

  private fun currentPositionMs(): Long =
    if (nativeActive && player != null) {
      player!!.currentPosition.coerceAtLeast(0L) + joinedOffsetMs
    } else {
      lastNativePositionMs
    }

  private fun currentDurationMs(): Long =
    if (nativeActive) player?.duration?.takeIf { it >= 0L } ?: durationMs else durationMs

  private fun stopNativePlayback(transferToWeb: Boolean = false): Long {
    val transferredPlaying = transferToWeb && player?.playWhenReady == true
    lastNativePositionMs = currentPositionMs()
    durationMs = currentDurationMs()
    // Disable callbacks before stopping; an old STATE_ENDED must not consume the queue.
    nativeActive = false
    pollHandler.removeCallbacks(watchdogRunnable)
    pollHandler.removeCallbacks(calibrateRunnable)
    runCatching {
      player?.pause()
      player?.stop()
      player?.clearMediaItems()
    }
    // Return the transferred intent, including a pause that arrived during preparation.
    playing = transferredPlaying
    isPlayingNow = playing
    releasePlaybackLocks()
    refreshNotification()
    return lastNativePositionMs
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
        override fun onPlay() = setPlaying(true)
        override fun onPause() = setPlaying(false)
        override fun onSkipToNext() = nextTrack()
        override fun onSkipToPrevious() = previousTrack()
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
    // Snapshots describe the web owner only, never the active native track or horizon.
    if (nativeActive) return
    val json = runCatching { JSONObject(raw) }.getOrNull() ?: return
    readTrack(json)
    nativeUrl = json.optString("streamUrl").ifBlank { null }
    lastNativePositionMs = json.optLong("positionMs", 0L).coerceAtLeast(0L)
    playing = json.optBoolean("playing", false)
    isPlayingNow = playing
    if (playing) acquirePlaybackLocks() else releasePlaybackLocks()
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
        pollHandler.post {
          if (instance !== this || artworkUrl != url) return@post
          artwork = bitmap
          refreshNotification()
        }
      }
    }.start()
  }

  private fun publishState() {
    val mediaSession = session ?: return
    val durationMs = currentDurationMs()
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
          when {
            nativeActive && nativeError != null -> PlaybackStateCompat.STATE_ERROR
            nativeActive && player?.playbackState == Player.STATE_BUFFERING -> PlaybackStateCompat.STATE_BUFFERING
            playing -> PlaybackStateCompat.STATE_PLAYING
            else -> PlaybackStateCompat.STATE_PAUSED
          },
          currentPositionMs(),
          if (playing) playbackRate else 0f
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
    publishState()
    runCatching {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, buildNotification())
    }
  }

  private fun stopPlayback() {
    stopNativePlayback()
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
  private fun replyWithState(intent: Intent, requestId: String?) {
    @Suppress("DEPRECATION")
    val receiver = intent.getParcelableExtra<ResultReceiver>(EXTRA_RECEIVER) ?: return
    val bundle = Bundle().apply {
      putString("requestId", requestId)
      putBoolean("active", nativeActive)
      putBoolean("playing", if (nativeActive) player?.playWhenReady == true else playing)
      putBoolean("buffering", nativeActive && player?.playbackState == Player.STATE_BUFFERING)
      putLong("positionMs", currentPositionMs())
      putLong("durationMs", currentDurationMs())
      putString("trackId", trackId)
      putString("streamUrl", nativeUrl ?: "")
      putString("title", title)
      putString("artist", artist)
      putString("album", album)
      putString("artwork", artworkUrl ?: "")
      putString("error", nativeError ?: "")
    }
    runCatching { receiver.send(0, bundle) }
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
    pollHandler.removeCallbacksAndMessages(null)
    nativeActive = false
    playing = false
    isPlayingNow = false
    runCatching { player?.release() }
    player = null
    releasePlaybackLocks()
    runCatching { session?.release() }
    session = null
    super.onDestroy()
  }
}
