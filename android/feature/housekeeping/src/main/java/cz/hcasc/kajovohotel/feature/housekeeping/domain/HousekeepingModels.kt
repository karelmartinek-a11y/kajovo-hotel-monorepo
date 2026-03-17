package cz.hcasc.kajovohotel.feature.housekeeping.domain

import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode

data class HousekeepingCaptureDraft(
    val mode: HousekeepingCaptureMode = HousekeepingCaptureMode.ISSUE,
    val roomNumber: String = "",
    val description: String = "",
    val location: String = "Pokoj",
) {
    fun isValid(): Boolean = roomNumber.isNotBlank() && description.isNotBlank()
}
