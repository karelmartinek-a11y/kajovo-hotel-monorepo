package cz.hcasc.kajovohotel.feature.housekeeping

import cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomDto
import cz.hcasc.kajovohotel.core.network.dto.HousekeepingStayDto
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingTileTone
import cz.hcasc.kajovohotel.feature.housekeeping.domain.housekeepingRooms
import cz.hcasc.kajovohotel.feature.housekeeping.domain.housekeepingTileAppearance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HousekeepingTileAppearanceTest {
    @Test
    fun `room order matches the employee mobile board`() {
        assertEquals(
            listOf("101", "102", "103", "104", "105", "106", "107", "108", "109", "203", "204", "205", "206", "207", "208", "301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "221", "222", "223", "224", "321", "322", "323", "324", "201", "202", "209", "210"),
            housekeepingRooms,
        )
    }

    @Test
    fun `pending departure and unready arrival use red split tones`() {
        val room = room(
            departures = listOf(stay(checkedOut = null)),
            arrivals = listOf(stay()),
            status = "dirty",
        )

        val appearance = housekeepingTileAppearance(room)

        assertTrue(appearance.split)
        assertEquals(HousekeepingTileTone.RED, appearance.left)
        assertEquals(HousekeepingTileTone.RED, appearance.right)
    }

    @Test
    fun `checked out departure is neutral and clean arrival is green`() {
        val room = room(
            departures = listOf(stay(checkedOut = "2026-09-29T10:00:00")),
            arrivals = listOf(stay()),
            status = "clean",
        )

        val appearance = housekeepingTileAppearance(room)

        assertEquals(HousekeepingTileTone.NEUTRAL, appearance.left)
        assertEquals(HousekeepingTileTone.GREEN, appearance.right)
    }

    @Test
    fun `continuing do not disturb stay is purple`() {
        assertEquals(HousekeepingTileTone.PURPLE, housekeepingTileAppearance(room(stays = listOf(stay()), status = "do_not_disturb")).full)
    }

    private fun room(
        departures: List<HousekeepingStayDto> = emptyList(),
        arrivals: List<HousekeepingStayDto> = emptyList(),
        stays: List<HousekeepingStayDto> = emptyList(),
        status: String = "dirty",
    ) = HousekeepingRoomDto(
        room_id = "room-1", room_number = "304", room_name = "304", floor = "3",
        housekeeping_status_key = status, housekeeping_status = status, operational_state = "free",
        occupancy_state = "free", arrival_today = arrivals.isNotEmpty(), departure_today = departures.isNotEmpty(),
        checked_out = false, occupied = stays.isNotEmpty(), persons = 1,
        departures = departures, arrivals = arrivals, stays = stays,
    )

    private fun stay(checkedOut: String? = null) = HousekeepingStayDto(
        reservation_id = "reservation-1", persons = 1, arrival = "2026-09-28", departure = "2026-09-30",
        checked_out = checkedOut,
    )
}
