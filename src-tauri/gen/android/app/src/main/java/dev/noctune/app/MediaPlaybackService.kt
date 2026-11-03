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
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
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
    const val ACTION_STOP = "dev.noctune.app.media.STOP"
    const val EXTRA_PAYLOAD = "payload"

    @Volatile
    var webView: WebView? = null

    @Volatile
    var isPlayingNow = false

    @Volatile
    private var instance: MediaPlaybackService? = null

    fun dispatch(action: String) {
      val wv = webView ?: return
      val js = "window.dispatchEvent(new CustomEvent('noctune:native-media-action',{detail:{action:'$action'}}));"
      wv.post { runCatching { wv.evaluateJavascript(js, null) } }
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
    createChannel()
    setupSession()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopPlayback()
        return START_NOT_STICKY
      }
      "play" -> {
        playing = true
        dispatch("play")
        refreshNotification()
      }
      "pause" -> {
        playing = false
        dispatch("pause")
        refreshNotification()
      }
      "next" -> dispatch("next")
      "prev" -> dispatch("prev")
      else -> {
        intent?.getStringExtra(EXTRA_PAYLOAD)?.let { applyPayload(it) }
        startForegroundSafely()
      }
    }
    if (intent?.action != ACTION_STOP) startForegroundSafely()
    return START_STICKY
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
          dispatch("play")
          refreshNotification()
        }

        override fun onPause() {
          playing = false
          isPlayingNow = false
          releasePlaybackLocks()
          dispatch("pause")
          refreshNotification()
        }

        override fun onSkipToNext() = dispatch("next")
        override fun onSkipToPrevious() = dispatch("prev")
        override fun onStop() = stopPlayback()
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
    title = json.optString("title", title).ifBlank { "Noctune" }
    artist = json.optString("artist", artist)
    album = json.optString("album", album)
    val nextArtwork = json.optString("artwork", "").ifBlank { null }

    if (nextArtwork != artworkUrl) {
      artworkUrl = nextArtwork
      artwork = null
      if (nextArtwork != null) loadArtwork(nextArtwork)
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

  override fun onDestroy() {
    instance = null
    runCatching { session?.release() }
    session = null
    super.onDestroy()
  }
}
