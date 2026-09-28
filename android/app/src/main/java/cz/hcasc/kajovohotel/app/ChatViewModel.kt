package cz.hcasc.kajovohotel.app

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import cz.hcasc.kajovohotel.core.network.api.ChatApi
import cz.hcasc.kajovohotel.core.network.dto.ChatConversationDto
import cz.hcasc.kajovohotel.core.network.dto.ChatMessageCreateRequest
import cz.hcasc.kajovohotel.core.network.dto.ChatMessageDto
import cz.hcasc.kajovohotel.core.network.dto.ChatParticipantDto
import cz.hcasc.kajovohotel.core.network.dto.ChatReadThroughRequest
import cz.hcasc.kajovohotel.core.network.dto.ChatFcmTokenRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChatUiState(
    val loading: Boolean = true,
    val conversations: List<ChatConversationDto> = emptyList(),
    val directory: List<ChatParticipantDto> = emptyList(),
    val selected: ChatConversationDto? = null,
    val messages: List<ChatMessageDto> = emptyList(),
    val draft: String = "",
    val sending: Boolean = false,
    val unreadCount: Int = 0,
    val error: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val api: ChatApi,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = mutableState.asStateFlow()

    init {
        viewModelScope.launch {
            refresh()
            var poll = 0
            while (true) {
                delay(3_000)
                poll += 1
                if (poll % 4 == 0) refresh(silent = true)
                mutableState.value.selected?.let { loadMessages(it.id) }
            }
        }
    }

    fun select(conversation: ChatConversationDto) {
        mutableState.update { it.copy(selected = conversation, error = null) }
        viewModelScope.launch { loadMessages(conversation.id) }
    }

    fun selectConversation(conversationId: Int): Boolean {
        val conversation = mutableState.value.conversations.firstOrNull { it.id == conversationId } ?: return false
        select(conversation)
        return true
    }

    fun registerPushToken() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            FcmTokenState.savePendingToken(context, token)
            viewModelScope.launch {
                try {
                    val response = api.registerFcmToken(ChatFcmTokenRequest(token))
                    if (response.isSuccessful) FcmTokenState.clearPendingToken(context, token)
                    else setFailure(IllegalStateException("FCM token registration failed (${response.code()})"))
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    setFailure(error)
                }
            }
        }
    }

    fun clearSelection() = mutableState.update { it.copy(selected = null, messages = emptyList(), error = null) }

    fun startConversation(participant: ChatParticipantDto) {
        viewModelScope.launch {
            try {
                val conversation = api.createConversation(
                    cz.hcasc.kajovohotel.core.network.dto.ChatConversationCreateRequest(participant.id),
                )
                mutableState.update { it.copy(selected = conversation, error = null) }
                refresh(silent = true)
                loadMessages(conversation.id)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                setFailure(error)
            }
        }
    }

    fun updateDraft(value: String) = mutableState.update { it.copy(draft = value.take(4000)) }

    fun send() {
        val current = mutableState.value
        val conversation = current.selected ?: return
        val body = current.draft.trim()
        if (body.isEmpty() || current.sending) return
        mutableState.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            try {
                api.sendMessage(ChatMessageCreateRequest(conversation.participant.id, body, UUID.randomUUID().toString()))
                mutableState.update { it.copy(draft = "") }
                loadMessages(conversation.id)
                refresh(silent = true)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                setFailure(error)
            } finally {
                mutableState.update { it.copy(sending = false) }
            }
        }
    }

    private suspend fun refresh(silent: Boolean = false) {
        if (!silent) mutableState.update { it.copy(loading = true, error = null) }
        try {
            val conversations = api.conversations()
            val directory = api.directory()
            val unread = api.unreadCount().unread_count
            val selectedId = mutableState.value.selected?.id
            mutableState.update { current ->
                current.copy(
                    conversations = conversations,
                    directory = directory,
                    selected = conversations.firstOrNull { it.id == selectedId } ?: current.selected,
                    unreadCount = unread,
                    loading = false,
                )
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            mutableState.update { it.copy(loading = false, error = error.message ?: "Chat se nepodařilo načíst.") }
        }
    }

    private suspend fun loadMessages(conversationId: Int) {
        try {
            val messages = api.messages(conversationId)
            if (mutableState.value.selected?.id != conversationId) return
            mutableState.update { it.copy(messages = messages, error = null) }
            messages.lastOrNull { !it.is_mine && it.read_at == null }?.let { unread ->
                api.markRead(conversationId, ChatReadThroughRequest(unread.id))
                refresh(silent = true)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            setFailure(error)
        }
    }

    private fun setFailure(error: Throwable) {
        mutableState.update { it.copy(error = error.message ?: "Operaci se nepodařilo dokončit.") }
    }
}
