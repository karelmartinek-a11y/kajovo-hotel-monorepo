package cz.hcasc.kajovohotel.feature.inventory

import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.feature.inventory.data.InventoryRepository
import cz.hcasc.kajovohotel.feature.inventory.presentation.InventoryViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class InventoryViewModelTest {
    @Test fun loadingCannotTurnCreateIntoEdit() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val vm = InventoryViewModel(InventoryRepository(FakeInventoryApi(), BaseUrlConfig("https://hotel.hcasc.cz")))
            vm.load()
            vm.startCreateItem()
            advanceUntilIdle()
            assertNull(vm.state.value.selectedItemId)
            assertNull(vm.state.value.selectedDetail)
            assertTrue(vm.state.value.isEditingItem)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun pendingDetailCannotOverwriteNewDraft() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val vm = InventoryViewModel(InventoryRepository(FakeInventoryApi(), BaseUrlConfig("https://hotel.hcasc.cz")))
            vm.loadDetail(9)
            vm.startCreateItem()
            vm.updateItemDraft { it.copy(name = "Nová položka") }
            advanceUntilIdle()
            assertNull(vm.state.value.selectedDetail)
            assertEquals("Nová položka", vm.state.value.itemDraft.name)
        } finally { Dispatchers.resetMain() }
    }
}
