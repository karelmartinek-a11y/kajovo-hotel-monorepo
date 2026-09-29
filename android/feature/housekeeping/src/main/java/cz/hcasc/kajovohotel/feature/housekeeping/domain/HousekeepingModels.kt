package cz.hcasc.kajovohotel.feature.housekeeping.domain

import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode

val housekeepingRooms = listOf(
    "101",
    "102",
    "103",
    "104",
    "105",
    "106",
    "107",
    "108",
    "109",
    "203",
    "204",
    "205",
    "206",
    "207",
    "208",
    "301",
    "302",
    "303",
    "304",
    "305",
    "306",
    "307",
    "308",
    "309",
    "310",
    "221",
    "222",
    "223",
    "224",
    "321",
    "322",
    "323",
    "324",
    "201",
    "202",
    "209",
    "210",
)

enum class HousekeepingTileTone { RED, GREEN, LIGHT_GREEN, PURPLE, NEUTRAL, GRAY }

data class HousekeepingTileAppearance(
    val split: Boolean,
    val left: HousekeepingTileTone,
    val right: HousekeepingTileTone,
    val full: HousekeepingTileTone,
)

fun housekeepingTileAppearance(room: cz.hcasc.kajovohotel.core.network.dto.HousekeepingRoomDto): HousekeepingTileAppearance {
    val hasSplitStays = room.departures.isNotEmpty() || room.arrivals.isNotEmpty()
    if (hasSplitStays) {
        val left = when {
            room.departures.isEmpty() -> HousekeepingTileTone.NEUTRAL
            room.departures.any { it.checked_out == null } -> HousekeepingTileTone.RED
            else -> HousekeepingTileTone.NEUTRAL
        }
        val right = when {
            room.housekeeping_status_key == "clean" || room.ready_for_arrival -> HousekeepingTileTone.GREEN
            room.housekeeping_status_key in setOf("stay_no_linen", "stay_with_linen") -> HousekeepingTileTone.LIGHT_GREEN
            room.arrivals.isNotEmpty() -> HousekeepingTileTone.RED
            else -> HousekeepingTileTone.NEUTRAL
        }
        return HousekeepingTileAppearance(true, left, right, HousekeepingTileTone.GRAY)
    }
    val full = when {
        room.stays.isNotEmpty() && room.housekeeping_status_key == "do_not_disturb" -> HousekeepingTileTone.PURPLE
        room.stays.isNotEmpty() && room.housekeeping_status_key in setOf("clean", "stay_no_linen", "stay_with_linen") -> HousekeepingTileTone.LIGHT_GREEN
        room.stays.isNotEmpty() -> HousekeepingTileTone.GRAY
        room.housekeeping_status_key == "clean" -> HousekeepingTileTone.GREEN
        else -> HousekeepingTileTone.GRAY
    }
    return HousekeepingTileAppearance(false, full, full, full)
}

data class HousekeepingCaptureDraft(
    val mode: HousekeepingCaptureMode = HousekeepingCaptureMode.ISSUE,
    val roomNumber: String = "",
    val description: String = "",
) {
    fun isValid(): Boolean = roomNumber.isNotBlank() && description.isNotBlank()

    fun isEmpty(): Boolean = roomNumber.isBlank() && description.isBlank()
}
