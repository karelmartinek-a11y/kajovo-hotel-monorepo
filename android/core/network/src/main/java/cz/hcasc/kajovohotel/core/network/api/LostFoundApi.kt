package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.LostFoundItemCreateDto
import cz.hcasc.kajovohotel.core.network.dto.LostFoundItemDto
import cz.hcasc.kajovohotel.core.network.dto.LostFoundItemUpdateDto
import cz.hcasc.kajovohotel.core.network.dto.MediaPhotoDto
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface LostFoundApi {
    @GET("/api/v1/lost-found") suspend fun list(@Query("type") itemType: String? = null, @Query("status") status: String? = null, @Query("category") category: String? = null): List<LostFoundItemDto>
    @GET("/api/v1/lost-found/{itemId}") suspend fun detail(@Path("itemId") itemId: Int): LostFoundItemDto
    @POST("/api/v1/lost-found") suspend fun create(@Body request: LostFoundItemCreateDto): LostFoundItemDto
    @PUT("/api/v1/lost-found/{itemId}") suspend fun update(@Path("itemId") itemId: Int, @Body request: LostFoundItemUpdateDto): LostFoundItemDto
    @GET("/api/v1/lost-found/{itemId}/photos") suspend fun listPhotos(@Path("itemId") itemId: Int): List<MediaPhotoDto>
    @Multipart @POST("/api/v1/lost-found/{itemId}/photos") suspend fun uploadPhotos(@Path("itemId") itemId: Int, @Part photos: List<MultipartBody.Part>): List<MediaPhotoDto>
}
