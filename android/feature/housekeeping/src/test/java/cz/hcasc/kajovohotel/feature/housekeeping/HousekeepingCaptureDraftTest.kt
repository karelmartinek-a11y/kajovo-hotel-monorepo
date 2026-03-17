package cz.hcasc.kajovohotel.feature.housekeeping

import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingCaptureDraft
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HousekeepingCaptureDraftTest {
    @Test
    fun quickCaptureRequiresRoomAndDescription() {
        assertFalse(HousekeepingCaptureDraft().isValid())
        assertTrue(HousekeepingCaptureDraft(roomNumber = "205", description = "Rozbitá lampa").isValid())
    }
}
