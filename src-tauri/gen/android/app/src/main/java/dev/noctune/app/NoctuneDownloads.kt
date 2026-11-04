package dev.noctune.app

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment

/**
 * Saves a resolved track to the device's public Downloads folder using the
 * platform DownloadManager, so mobile downloads land on the phone instead of
 * the desktop host. DownloadManager handles scoped storage, the progress
 * notification and the completed-download intent without any runtime
 * permission on Android 10+.
 */
object NoctuneDownloads {

  fun enqueue(context: Context, url: String, rawFileName: String) {
    if (url.isBlank()) return
    val fileName = sanitize(rawFileName)
    runCatching {
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(fileName)
        .setDescription("Noctune")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(false)
      val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      manager.enqueue(request)
    }
  }

  private fun sanitize(name: String): String {
    val trimmed = name.trim().ifBlank { "noctune-track" }
    val clean = trimmed.replace(Regex("""[\\/:*?"<>|]"""), "_").take(120)
    return if (clean.contains('.')) clean else "$clean.m4a"
  }
}
