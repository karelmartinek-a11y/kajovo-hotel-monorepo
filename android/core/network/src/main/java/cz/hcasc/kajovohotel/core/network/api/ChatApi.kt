package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.ChatConversationCreateRequest
import cz.hcasc.kajovohotel.core.network.dto.ChatConversationDto
import cz.hcasc.kajovohotel.core.network.dto.ChatMessageCreateRequest
import cz.hcasc.kajovohotel.core.network.dto.ChatMessageDto
import cz.hcasc.kajovohotel.core.network.dto.ChatParticipantDto
import cz.hcasc.kajovohotel.core.network.dto.ChatReadThroughRequest
import cz.hcasc.kajovohotel.core.network.dto.ChatUnreadCountDto
import cz.hcasc.kajovohotel.core.network.dto.ChatFcmTokenRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.DELETE
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ChatApi {
    @GET("/api/v1/chat/directory") suspend fun directory(): List<ChatParticipantDto>
    @GET("/api/v1/chat/conversations") suspend fun conversations(): List<ChatConversationDto>
    @GET("/api/v1/chat/unread-count") suspend fun unreadCount(): ChatUnreadCountDto
    @POST("/api/v1/chat/conversations") suspend fun createConversation(@Body request: ChatConversationCreateRequest): ChatConversationDto
    @GET("/api/v1/chat/conversations/{conversationId}/messages") suspend fun messages(
        @Path("conversationId") conversationId: Int,
        @Query("limit") limit: Int = 100,
    ): List<ChatMessageDto>
    @POST("/api/v1/chat/messages") suspend fun sendMessage(@Body request: ChatMessageCreateRequest): ChatMessageDto
    @POST("/api/v1/chat/conversations/{conversationId}/read") suspend fun markRead(
        @Path("conversationId") conversationId: Int,
        @Body request: ChatReadThroughRequest,
    ): Response<Unit>
    @POST("/api/v1/chat/fcm-tokens") suspend fun registerFcmToken(@Body request: ChatFcmTokenRequest): Response<Unit>
    @DELETE("/api/v1/chat/fcm-tokens") suspend fun unregisterFcmToken(@Body request: ChatFcmTokenRequest): Response<Unit>
}
