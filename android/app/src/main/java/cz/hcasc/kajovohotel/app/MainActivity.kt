package cz.hcasc.kajovohotel.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import cz.hcasc.kajovohotel.core.common.PortalLocalization
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private var resetToken by mutableStateOf<String?>(null)
    private var openChat by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        PortalLocalization.initialize(applicationContext)
        resetToken = extractResetToken(intent)
        openChat = intent.getBooleanExtra(InternalChatMessagingService.EXTRA_OPEN_CHAT, false)
        setContent {
            KajovoHotelApp(
                passwordResetToken = resetToken,
                onPasswordResetTokenConsumed = { resetToken = null },
                openChat = openChat,
                onOpenChatConsumed = { openChat = false },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        resetToken = extractResetToken(intent)
        openChat = intent.getBooleanExtra(InternalChatMessagingService.EXTRA_OPEN_CHAT, false)
    }

    private fun extractResetToken(intent: Intent?): String? {
        val data: Uri = intent?.data ?: return null
        if (data.host != "hotel.hcasc.cz" || data.path != "/login/reset") {
            return null
        }
        return data.getQueryParameter("token")?.trim()?.takeIf { it.isNotEmpty() }
    }
}
