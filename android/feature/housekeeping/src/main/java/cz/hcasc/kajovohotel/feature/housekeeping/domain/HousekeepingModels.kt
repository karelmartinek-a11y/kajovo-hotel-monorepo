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
    "201",
    "202",
    "209",
    "210",
    "221",
    "222",
    "223",
    "224",
    "321",
    "322",
    "323",
    "324",
)

data class HousekeepingCaptureDraft(
    val mode: HousekeepingCaptureMode = HousekeepingCaptureMode.ISSUE,
    val roomNumber: String = "",
    val description: String = "",
) {
    fun isValid(): Boolean = roomNumber.isNotBlank() && description.isNotBlank()
}
