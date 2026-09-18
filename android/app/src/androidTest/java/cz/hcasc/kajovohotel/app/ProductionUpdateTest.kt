package cz.hcasc.kajovohotel.app

import androidx.compose.runtime.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class ProductionUpdateTest {
    @get:Rule val compose = createComposeRule()

    @Test fun explicitProductionDownloadVerifiesRealApkAndOpensInstallerFlow() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("verifyProductionUpdate") == "true")
        val payload = runBlocking(Dispatchers.IO) {
            JSONObject(URL("https://hotel.hcasc.cz/api/app/android-release").readText())
        }
        val info = AppUpdateInfo(
            BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME,
            payload.getInt("version_code"), payload.getString("version"),
            payload.getString("download_url"), payload.getString("sha256"),
            payload.getString("title"), payload.getString("message"), payload.getBoolean("required"),
        )
        assertEquals("https://hotel.hcasc.cz/downloads/kajovo-hotel-android.apk", info.downloadUrl)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val updater = AndroidAppUpdater(context)
        var pending by mutableStateOf<Int?>(info.latestVersionCode)
        val completed = AtomicBoolean(false)
        compose.setContent {
            AutomaticUpdateEffect(
                AppUpdateState(availableUpdate = info, pendingAutoStartVersionCode = pending),
                onConsumed = { pending = null; completed.set(true) },
                onUpdate = updater::startBestEffortUpdate,
            )
        }
        compose.waitUntil(60_000) { completed.get() }
        val apk = File(context.cacheDir, "updates/kajovo-hotel-${info.latestVersionCode}.apk")
        assertTrue(apk.isFile)
        val digest = MessageDigest.getInstance("SHA-256").digest(apk.readBytes()).joinToString("") { "%02x".format(it) }
        assertEquals(info.sha256, digest)
    }
}
