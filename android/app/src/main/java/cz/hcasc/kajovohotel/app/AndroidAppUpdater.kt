package cz.hcasc.kajovohotel.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

class AndroidAppUpdater(private val context: Context) {
    private val httpClient = OkHttpClient()

    suspend fun startBestEffortUpdate(updateInfo: AppUpdateInfo) {
        runCatching { downloadAndLaunchInstaller(updateInfo) }
            .getOrElse { openBrowserFallback(updateInfo.downloadUrl) }
    }

    private suspend fun downloadAndLaunchInstaller(updateInfo: AppUpdateInfo) {
        val apkFile = withContext(Dispatchers.IO) {
            val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
            val targetFile = File(updatesDir, "kajovo-hotel-${updateInfo.latestVersionCode}.apk")
            if (!targetFile.exists() || sha256Of(targetFile) != updateInfo.sha256.lowercase()) {
                downloadApk(updateInfo.downloadUrl, targetFile)
            }
            val actualHash = sha256Of(targetFile)
            check(actualHash == updateInfo.sha256.lowercase()) {
                "Stažená APK neodpovídá očekávanému hashi: $actualHash"
            }
            targetFile
        }
        launchInstaller(apkFile)
    }

    private fun downloadApk(downloadUrl: String, targetFile: File) {
        val request = Request.Builder().url(downloadUrl).build()
        httpClient.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "Stažení APK selhalo: HTTP ${response.code}" }
            val body = checkNotNull(response.body) { "Chybí response body pro APK" }
            targetFile.outputStream().use { output ->
                body.byteStream().use { input ->
                    input.copyTo(output)
                }
            }
        }
    }

    private fun launchInstaller(apkFile: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settingsIntent)
            return
        }

        val apkUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(installIntent)
    }

    private fun openBrowserFallback(downloadUrl: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun sha256Of(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) {
                    break
                }
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
