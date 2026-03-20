package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.ReportCreateDto
import cz.hcasc.kajovohotel.core.network.dto.ReportDto
import cz.hcasc.kajovohotel.core.network.dto.ReportUpdateDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface ReportsApi {
    @GET("/api/v1/reports")
    suspend fun list(@Query("status") status: String? = null): List<ReportDto>

    @GET("/api/v1/reports/{reportId}")
    suspend fun detail(@Path("reportId") reportId: Int): ReportDto

    @POST("/api/v1/reports")
    suspend fun create(@Body request: ReportCreateDto): ReportDto

    @PUT("/api/v1/reports/{reportId}")
    suspend fun update(@Path("reportId") reportId: Int, @Body request: ReportUpdateDto): ReportDto
}
