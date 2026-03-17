package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.IssueCreateDto
import cz.hcasc.kajovohotel.core.network.dto.IssueDto
import cz.hcasc.kajovohotel.core.network.dto.IssueUpdateDto
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

interface IssuesApi {
    @GET("/api/v1/issues") suspend fun list(@Query("priority") priority: String? = null, @Query("status") status: String? = null, @Query("location") location: String? = null, @Query("room_number") roomNumber: String? = null): List<IssueDto>
    @GET("/api/v1/issues/{issueId}") suspend fun detail(@Path("issueId") issueId: Int): IssueDto
    @POST("/api/v1/issues") suspend fun create(@Body request: IssueCreateDto): IssueDto
    @PUT("/api/v1/issues/{issueId}") suspend fun update(@Path("issueId") issueId: Int, @Body request: IssueUpdateDto): IssueDto
    @GET("/api/v1/issues/{issueId}/photos") suspend fun listPhotos(@Path("issueId") issueId: Int): List<MediaPhotoDto>
    @Multipart @POST("/api/v1/issues/{issueId}/photos") suspend fun uploadPhotos(@Path("issueId") issueId: Int, @Part photos: List<MultipartBody.Part>): List<MediaPhotoDto>
}
