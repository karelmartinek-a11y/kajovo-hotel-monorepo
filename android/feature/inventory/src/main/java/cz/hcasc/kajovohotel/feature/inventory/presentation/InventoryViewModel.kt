package cz.hcasc.kajovohotel.feature.inventory.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.feature.inventory.data.InventoryRepository
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemDetail
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemSummary
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class InventoryViewModel @Inject constructor(
    private val repository: InventoryRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(InventoryUiState())
    val state: StateFlow<InventoryUiState> = mutableState.asStateFlow()

    fun load() {
        mutableState.value = mutableState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.list()) {
                is AppResult.Success -> {
                    val selected = result.value.firstOrNull()
                    mutableState.value = mutableState.value.copy(
                        isLoading = false,
                        items = result.value,
                        selectedItem = selected,
                    )
                    selected?.let { loadDetail(it.id) }
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    fun select(item: InventoryItemSummary) {
        mutableState.value = mutableState.value.copy(selectedItem = item, successMessage = null)
        loadDetail(item.id)
    }

    fun updateDraft(transform: (InventoryMovementDraft) -> InventoryMovementDraft) {
        mutableState.value = mutableState.value.copy(draft = transform(mutableState.value.draft))
    }

    fun submitMovement() {
        val selected = mutableState.value.selectedItem ?: run {
            mutableState.value = mutableState.value.copy(errorMessage = "Nejprve vyberte skladovou položku.")
            return
        }
        val draft = mutableState.value.draft
        if (!draft.isValid()) {
            mutableState.value = mutableState.value.copy(errorMessage = "Vyplňte množství a datum dokladu.")
            return
        }
        mutableState.value = mutableState.value.copy(isSaving = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.submitMovement(selected.id, draft)) {
                is AppResult.Success -> mutableState.value = mutableState.value.withDetail(result.value).copy(
                    isSaving = false,
                    draft = InventoryMovementDraft(),
                    successMessage = "Pohyb byl založen. Doklad ${result.value.movements.firstOrNull()?.documentNumber ?: result.value.id}.",
                )
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSaving = false, errorMessage = result.message)
            }
        }
    }

    private fun loadDetail(itemId: Int) {
        mutableState.value = mutableState.value.copy(isLoadingDetail = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.detail(itemId)) {
                is AppResult.Success -> mutableState.value = mutableState.value.withDetail(result.value).copy(isLoadingDetail = false)
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoadingDetail = false, errorMessage = result.message)
            }
        }
    }
}

data class InventoryUiState(
    val isLoading: Boolean = false,
    val isLoadingDetail: Boolean = false,
    val isSaving: Boolean = false,
    val items: List<InventoryItemSummary> = emptyList(),
    val selectedItem: InventoryItemSummary? = null,
    val selectedDetail: InventoryItemDetail? = null,
    val draft: InventoryMovementDraft = InventoryMovementDraft(),
    val errorMessage: String? = null,
    val successMessage: String? = null,
)

private fun InventoryUiState.withDetail(detail: InventoryItemDetail): InventoryUiState {
    val updatedSummary = InventoryItemSummary(
        id = detail.id,
        name = detail.name,
        unit = detail.unit,
        currentStock = detail.currentStock,
        minStock = detail.minStock,
    )
    return copy(
        selectedItem = updatedSummary,
        selectedDetail = detail,
        items = items.map { item -> if (item.id == detail.id) updatedSummary else item },
    )
}
