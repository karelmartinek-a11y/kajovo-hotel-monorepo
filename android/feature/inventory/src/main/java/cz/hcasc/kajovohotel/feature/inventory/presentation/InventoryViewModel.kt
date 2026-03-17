package cz.hcasc.kajovohotel.feature.inventory.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.feature.inventory.data.InventoryRepository
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
                    val selectedId = mutableState.value.selectedItemId ?: result.value.firstOrNull()?.id
                    mutableState.value = mutableState.value.copy(
                        isLoading = false,
                        items = result.value,
                        selectedItemId = selectedId,
                    )
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    fun selectItem(itemId: Int) {
        mutableState.value = mutableState.value.copy(selectedItemId = itemId, successMessage = null)
    }

    fun updateDraft(transform: (InventoryMovementDraft) -> InventoryMovementDraft) {
        mutableState.value = mutableState.value.copy(draft = transform(mutableState.value.draft))
    }

    fun submitMovement() {
        val selectedId = mutableState.value.selectedItemId ?: run {
            mutableState.value = mutableState.value.copy(errorMessage = "Vyberte položku skladu.")
            return
        }
        val draft = mutableState.value.draft
        if (!draft.isValid()) {
            mutableState.value = mutableState.value.copy(errorMessage = "Vyplňte množství a datum dokladu.")
            return
        }
        mutableState.value = mutableState.value.copy(isSaving = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.submitMovement(selectedId, draft)) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSaving = false,
                        draft = InventoryMovementDraft(),
                        successMessage = result.value?.documentNumber?.let { "Pohyb byl uložen. Interní číslo $it." } ?: "Pohyb byl uložen.",
                    )
                    load()
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSaving = false, errorMessage = result.message)
            }
        }
    }
}

data class InventoryUiState(
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val items: List<InventoryItemSummary> = emptyList(),
    val selectedItemId: Int? = null,
    val draft: InventoryMovementDraft = InventoryMovementDraft(),
    val errorMessage: String? = null,
    val successMessage: String? = null,
)
