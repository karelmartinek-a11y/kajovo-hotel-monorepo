package cz.hcasc.kajovohotel.feature.breakfast

import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.isValidForSubmit
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BreakfastDraftTest {
    @Test
    fun validDraftRequiresDateRoomGuestAndPositiveCount() {
        assertFalse(BreakfastDraft().isValidForSubmit())
        assertFalse(BreakfastDraft(serviceDate = "2026-03-17", roomNumber = "101", guestName = "Novák", guestCount = "0").isValidForSubmit())
        assertTrue(BreakfastDraft(serviceDate = "2026-03-17", roomNumber = "101", guestName = "Novák", guestCount = "2").isValidForSubmit())
    }
}
