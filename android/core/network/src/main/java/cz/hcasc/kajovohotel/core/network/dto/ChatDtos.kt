package cz.hcasc.kajovohotel.core.network.dto

data class ChatParticipantDto(
    val id: Int,
    val display_name: String,
    val email: String,
    val is_active: Boolean,
)

data class ChatMessageDto(
    val id: Int,
    val conversation_id: Int,
    val sender_id: Int,
    val is_mine: Boolean,
    val body: String,
    val sent_at: String,
    val read_at: String? = null,
)

data class ChatConversationDto(
    val id: Int,
    val participant: ChatParticipantDto,
    val last_message: ChatMessageDto? = null,
    val unread_count: Int = 0,
)

data class ChatConversationCreateRequest(val recipient_id: Int)
data class ChatMessageCreateRequest(val recipient_id: Int, val body: String, val client_message_id: String)
data class ChatReadThroughRequest(val through_message_id: Int)
data class ChatFcmTokenRequest(val token: String)
data class ChatUnreadCountDto(val unread_count: Int)
