package cz.hcasc.kajovohotel.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import cz.hcasc.kajovohotel.core.common.PortalLocalization
import cz.hcasc.kajovohotel.core.network.api.ChatApi
import cz.hcasc.kajovohotel.core.network.dto.ChatFcmTokenRequest
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@AndroidEntryPoint
class InternalChatMessagingService : FirebaseMessagingService() {
    @Inject lateinit var chatApi: ChatApi
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        FcmTokenState.savePendingToken(applicationContext, token)
        if (!FcmTokenState.hasEmployeeSession(applicationContext) || !NotificationManagerCompat.from(this).areNotificationsEnabled()) return
        serviceScope.launch {
            runCatching { chatApi.registerFcmToken(ChatFcmTokenRequest(token)) }
                .onSuccess { response -> if (response.isSuccessful) FcmTokenState.clearPendingToken(applicationContext, token) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] != "chat_message") return
        val conversationId = message.data["conversation_id"]?.toIntOrNull() ?: return
        PortalLocalization.initialize(applicationContext)
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, PortalLocalization.text(getString(R.string.chat_notification_channel)), NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val openChat = Intent(this, MainActivity::class.java)
            .putExtra(EXTRA_OPEN_CHAT, true)
            .putExtra(EXTRA_CONVERSATION_ID, conversationId)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pendingIntent = PendingIntent.getActivity(
            this,
            conversationId,
            openChat,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(PortalLocalization.text(getString(R.string.chat_notification_generic)))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        if (NotificationManagerCompat.from(this).areNotificationsEnabled()) {
            NotificationManagerCompat.from(this).notify(conversationId, notification)
        }
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_OPEN_CHAT = "open_chat"
        const val EXTRA_CONVERSATION_ID = "conversation_id"
        const val CHANNEL_ID = "internal_chat"
    }
}
