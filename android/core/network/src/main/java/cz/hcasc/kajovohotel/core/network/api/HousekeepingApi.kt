package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomDto
import cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomStatusUpdateDto
import cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomsOverviewDto
import cz.hcasc.kajovohotel.core.network.dto.ReservationAmenityDto
import cz.hcasc.kajovohotel.core.network.dto.ReservationAmenityUpdateDto
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

    @PATCH("/api/v1/housekeeping/reservations/{reservationId}/amenities/{kind}")
    suspend fun updateReservationAmenity(
        @Path("reservationId") reservationId: String,
        @Path("kind") kind: String,
        @Query("room_id") roomId: String,
        @Query("date") serviceDate: String,
        @Body request: ReservationAmenityUpdateDto,
    ): ReservationAmenityDto
}
