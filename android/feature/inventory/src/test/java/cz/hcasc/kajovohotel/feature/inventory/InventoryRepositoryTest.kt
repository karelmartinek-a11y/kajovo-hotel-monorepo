package cz.hcasc.kajovohotel.feature.inventory

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.feature.inventory.data.InventoryRepository
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryRepositoryTest {
    @Test
    fun listReturnsInventoryItems() = runTest {
        val repository = InventoryRepository(FakeInventoryApi())
        val result = repository.list()
        assertTrue(result is AppResult.Success)
        assertEquals("Káva", (result as AppResult.Success).value.first().name)
    }

    @Test
    fun submitMovementReturnsDocumentNumber() = runTest {
        val repository = InventoryRepository(FakeInventoryApi())
        val result = repository.submitMovement(9, InventoryMovementDraft(quantity = "4", documentDate = "2026-03-17"))
        assertTrue(result is AppResult.Success)
        assertEquals("DOC-42", (result as AppResult.Success).value?.documentNumber)
    }
}
