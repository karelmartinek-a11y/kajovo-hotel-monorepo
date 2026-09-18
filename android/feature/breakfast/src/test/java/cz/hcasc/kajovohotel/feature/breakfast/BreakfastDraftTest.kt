package cz.hcasc.kajovohotel.feature.breakfast

import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDietKey
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastImportItem
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrderDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.applyDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.breakfast.domain.matchesSearch
import cz.hcasc.kajovohotel.feature.breakfast.domain.toggleDiet
import org.junit.Assert.assertEquals
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

    @Test
    fun queuedDraftMergesStatusAndDietChanges() {
        val order = BreakfastOrder(
            id = 1,
            serviceDate = "2026-03-17",
            roomNumber = "101",
            guestName = "Novák",
            guestCount = 2,
            note = "",
            noGluten = false,
            noMilk = false,
            noPork = false,
            status = BreakfastStatus.PENDING,
        )

        val merged = order.applyDraft(
            BreakfastOrderDraft(
                status = BreakfastStatus.SERVED,
                noGluten = true,
            ),
        )

        assertEquals(BreakfastStatus.SERVED, merged.status)
        assertTrue(merged.noGluten)
    }

    @Test
    fun searchMatchesRoomAndGuest() {
        val order = BreakfastOrder(
            id = 1,
            serviceDate = "2026-03-17",
            roomNumber = "205",
            guestName = "Svoboda",
            guestCount = 1,
            note = "",
            noGluten = false,
            noMilk = false,
            noPork = false,
            status = BreakfastStatus.PENDING,
        )

        assertTrue(order.matchesSearch("205"))
        assertTrue(order.matchesSearch("svob"))
        assertFalse(order.matchesSearch("novak"))
    }

    @Test
    fun importPreviewDietToggleFlipsRequestedFlagOnly() {
        val item = BreakfastImportItem(
            room = 101,
            count = 2,
            guestName = "Novák",
            noGluten = false,
            noMilk = false,
            noPork = false,
        )

        val toggled = item.toggleDiet(BreakfastDietKey.NO_MILK)

        assertTrue(toggled.noMilk)
        assertFalse(toggled.noGluten)
        assertFalse(toggled.noPork)
    }
}
