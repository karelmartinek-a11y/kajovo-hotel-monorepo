package cz.hcasc.kajovohotel.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private var resetToken by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        installSplashScreen()
        resetToken = extractResetToken(intent)
        setContent {
            KajovoHotelApp(
                passwordResetToken = resetToken,
                onPasswordResetTokenConsumed = { resetToken = null },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        resetToken = extractResetToken(intent)
    }

    private fun extractResetToken(intent: Intent?): String? {
        val data: Uri = intent?.data ?: return null
        if (data.host != "hotel.hcasc.cz" || data.path != "/login/reset") {
            return null
        }
        return data.getQueryParameter("token")?.trim()?.takeIf { it.isNotEmpty() }
    }
}
