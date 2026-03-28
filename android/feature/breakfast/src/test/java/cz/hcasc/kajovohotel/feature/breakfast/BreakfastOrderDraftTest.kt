package cz.hcasc.kajovohotel.feature.breakfast

import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrderDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.applyDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.matchesSearch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BreakfastOrderDraftTest {
    @Test
    fun applyDraftOverridesOnlyQueuedFields() {
        val order = BreakfastOrder(
            id = 7,
            serviceDate = "2026-03-28",
            roomNumber = "204",
            guestName = "Novák",
            guestCount = 2,
            note = "",
            noGluten = false,
            noMilk = false,
            noPork = false,
            status = BreakfastStatus.PENDING,
        )

        val updated = order.applyDraft(
            BreakfastOrderDraft(
                status = BreakfastStatus.SERVED,
                noGluten = true,
            ),
        )

        assertEquals(BreakfastStatus.SERVED, updated.status)
        assertTrue(updated.noGluten)
        assertFalse(updated.noMilk)
        assertFalse(updated.noPork)
    }

    @Test
    fun matchesSearchChecksRoomAndGuestName() {
        val order = BreakfastOrder(
            id = 9,
            serviceDate = "2026-03-28",
            roomNumber = "321",
            guestName = "Jana Svobodová",
            guestCount = 1,
            note = "",
            noGluten = false,
            noMilk = false,
            noPork = false,
            status = BreakfastStatus.PENDING,
        )

        assertTrue(order.matchesSearch("321"))
        assertTrue(order.matchesSearch("svobod"))
        assertFalse(order.matchesSearch("recepce"))
    }
}
