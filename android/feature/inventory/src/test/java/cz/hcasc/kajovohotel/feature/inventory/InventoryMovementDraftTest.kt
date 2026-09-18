package cz.hcasc.kajovohotel.feature.inventory

import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryMovementDraftTest {
    @Test
    fun movementRequiresPositiveQuantityAndDate() {
        assertFalse(InventoryMovementDraft(quantity = "0").isValid())
        assertTrue(InventoryMovementDraft(quantity = "3", documentDate = "2026-03-17").isValid())
    }
}
