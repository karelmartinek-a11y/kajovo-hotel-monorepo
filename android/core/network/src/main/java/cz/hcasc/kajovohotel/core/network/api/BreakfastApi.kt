package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.BreakfastDailySummaryDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastImportResponseDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderCreateDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderUpdateDto
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface BreakfastApi {
    @GET("/api/v1/breakfast") suspend fun list(@Query("service_date") serviceDate: String? = null, @Query("status") status: String? = null): List<BreakfastOrderDto>
    @GET("/api/v1/breakfast/daily-summary") suspend fun dailySummary(@Query("service_date") serviceDate: String): BreakfastDailySummaryDto
    @GET("/api/v1/breakfast/{orderId}") suspend fun detail(@Path("orderId") orderId: Int): BreakfastOrderDto
    @POST("/api/v1/breakfast") suspend fun create(@Body request: BreakfastOrderCreateDto): BreakfastOrderDto
    @PUT("/api/v1/breakfast/{orderId}") suspend fun update(@Path("orderId") orderId: Int, @Body request: BreakfastOrderUpdateDto): BreakfastOrderDto
    @Multipart @POST("/api/v1/breakfast/import") suspend fun importPdf(@Part file: MultipartBody.Part, @Part("save") save: RequestBody, @Part("overrides") overrides: RequestBody? = null): BreakfastImportResponseDto
    @Streaming @GET("/api/v1/breakfast/export/daily") suspend fun exportDaily(@Query("service_date") serviceDate: String): Response<ResponseBody>
}
