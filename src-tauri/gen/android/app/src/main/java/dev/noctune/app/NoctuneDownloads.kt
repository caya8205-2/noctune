package dev.noctune.app

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL

/**
 * Saves a resolved track to the device's public Downloads folder.
 *
 * HTTPS streams go through the platform DownloadManager: it survives the app,
 * shows a progress notification and needs no runtime storage permission on
 * API 29+. Cleartext URLs (LAN pairing, http://192.168.x.x) must NOT use it —
 * DownloadManager runs inside the downloads provider process, which blocks
 * cleartext traffic, so the enqueue succeeds but the transfer fails with no file
 * and no error. Those URLs are streamed by the app itself into MediaStore.
 */
object NoctuneDownloads {

  private const val TAG = "NoctuneDownloads"

  fun enqueue(context: Context, url: String, rawFileName: String) {
    if (url.isBlank()) return
    val fileName = sanitize(rawFileName)
    if (url.startsWith("https://", ignoreCase = true) || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      enqueueWithDownloadManager(context, url, fileName)
    } else {
      streamIntoDownloads(context, url, fileName)
    }
  }

  private fun enqueueWithDownloadManager(context: Context, url: String, fileName: String) {
    runCatching {
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(fileName)
        .setDescription("Noctune")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(false)
      val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val id = manager.enqueue(request)
      Log.i(TAG, "queued download id=$id file=$fileName")
    }.onFailure { Log.w(TAG, "download manager enqueue failed for $url", it) }
  }

  private fun streamIntoDownloads(context: Context, url: String, fileName: String) {
    val appContext = context.applicationContext
    Thread {
      var connection: HttpURLConnection? = null
      try {
        connection = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 15_000
          readTimeout = 30_000
          instanceFollowRedirects = true
        }
        connection.connect()
        val code = connection.responseCode
        if (code !in 200..299) {
          Log.w(TAG, "download failed: HTTP $code for $url")
          return@Thread
        }

        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, fileName)
          put(MediaStore.Downloads.MIME_TYPE, "audio/mp4")
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val uri = appContext.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        if (uri == null) {
          Log.w(TAG, "could not create MediaStore entry for $fileName")
          return@Thread
        }
        appContext.contentResolver.openOutputStream(uri)?.use { out ->
          connection.inputStream.use { input -> input.copyTo(out, 64 * 1024) }
        }
        Log.i(TAG, "saved $fileName via MediaStore")
      } catch (t: Throwable) {
        Log.w(TAG, "direct download failed for $url", t)
      } finally {
        connection?.disconnect()
      }
    }.start()
  }

  private fun sanitize(name: String): String {
    val trimmed = name.trim().ifBlank { "noctune-track" }
    val clean = trimmed.replace(Regex("""[\\/:*?"<>|]"""), "_").take(120)
    return if (clean.contains('.')) clean else "$clean.m4a"
  }
}
