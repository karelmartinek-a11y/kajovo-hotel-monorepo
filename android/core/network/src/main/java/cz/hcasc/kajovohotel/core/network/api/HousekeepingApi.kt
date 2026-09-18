package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomDto
import cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomStatusUpdateDto
import cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomsOverviewDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

interface HousekeepingApi {
    @GET("/api/v1/housekeeping/rooms")
    suspend fun rooms(@Query("date") date: String): HousekeepingRoomsOverviewDto

    @PATCH("/api/v1/housekeeping/rooms/{roomId}")
    suspend fun updateRoomStatus(
        @Path("roomId") roomId: String,
        @Query("date") date: String,
        @Body request: HousekeepingRoomStatusUpdateDto,
    ): HousekeepingRoomDto
}
