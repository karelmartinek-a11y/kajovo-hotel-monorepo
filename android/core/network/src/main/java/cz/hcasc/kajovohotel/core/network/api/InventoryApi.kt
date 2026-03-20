package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.InventoryItemCreateDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDetailDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemUpdateDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryMovementCreateDto
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface InventoryApi {
    @GET("/api/v1/inventory")
    suspend fun list(@Query("low_stock") lowStock: Boolean = false): List<InventoryItemDto>

    @GET("/api/v1/inventory/{itemId}")
    suspend fun detail(@Path("itemId") itemId: Int): InventoryItemDetailDto

    @POST("/api/v1/inventory")
    suspend fun create(@Body request: InventoryItemCreateDto): InventoryItemDto

    @PUT("/api/v1/inventory/{itemId}")
    suspend fun update(@Path("itemId") itemId: Int, @Body request: InventoryItemUpdateDto): InventoryItemDto

    @POST("/api/v1/inventory/{itemId}/movements")
    suspend fun addMovement(@Path("itemId") itemId: Int, @Body request: InventoryMovementCreateDto): InventoryItemDetailDto

    @Multipart
    @POST("/api/v1/inventory/{itemId}/pictogram")
    suspend fun uploadPictogram(@Path("itemId") itemId: Int, @Part file: MultipartBody.Part): InventoryItemDto
}
