package cz.hcasc.kajovohotel.feature.inventory

import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import cz.hcasc.kajovohotel.core.model.InventoryMovementType
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryMovementDraftTest {
    @Test fun incomingMovementRequiresDocumentReference() {
        val draft = InventoryMovementDraft(movementType = InventoryMovementType.IN, quantity = "2")
        assertFalse(draft.isValid())
        assertFalse(draft.copy(documentReference = "  ").isValid())
        assertTrue(draft.copy(documentReference = "QA-1").isValid())
    }

    @Test fun outgoingAndAdjustmentKeepOptionalDocumentReference() {
        assertTrue(InventoryMovementDraft(movementType = InventoryMovementType.OUT, quantity = "2").isValid())
        assertTrue(InventoryMovementDraft(movementType = InventoryMovementType.ADJUST, quantity = "2").isValid())
    }
    @Test
    fun movementRequiresPositiveQuantityAndDate() {
        assertFalse(InventoryMovementDraft(quantity = "0").isValid())
        assertTrue(InventoryMovementDraft(quantity = "3", documentDate = "2026-03-17").isValid())
    }
}
