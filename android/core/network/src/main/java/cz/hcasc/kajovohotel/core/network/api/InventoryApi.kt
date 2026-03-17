package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDetailDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryMovementCreateDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface InventoryApi {
    @GET("/api/v1/inventory") suspend fun list(@Query("low_stock") lowStock: Boolean = false): List<InventoryItemDto>
    @POST("/api/v1/inventory/{itemId}/movements") suspend fun addMovement(@Path("itemId") itemId: Int, @Body request: InventoryMovementCreateDto): InventoryItemDetailDto
}
