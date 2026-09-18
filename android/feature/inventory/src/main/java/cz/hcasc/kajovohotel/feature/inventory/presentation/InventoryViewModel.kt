package cz.hcasc.kajovohotel.feature.inventory.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.feature.inventory.data.InventoryRepository
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemDetail
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemDraft
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemSummary
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import cz.hcasc.kajovohotel.feature.inventory.domain.toItemDraft
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
                    if (selectedId != null) {
                        loadDetail(selectedId)
                    }
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    fun loadDetail(itemId: Int) {
        viewModelScope.launch {
            when (val result = repository.detail(itemId)) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        selectedItemId = itemId,
                        selectedDetail = result.value,
                        itemDraft = if (mutableState.value.isEditingItem) mutableState.value.itemDraft else result.value.toItemDraft(),
                    )
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(errorMessage = result.message)
            }
        }
    }

    fun selectItem(itemId: Int) {
        mutableState.value = mutableState.value.copy(selectedItemId = itemId, successMessage = null, isEditingItem = false, selectedPictogram = null)
        loadDetail(itemId)
    }

    fun startCreateItem() {
        mutableState.value = mutableState.value.copy(
            isEditingItem = true,
            selectedItemId = null,
            selectedDetail = null,
            itemDraft = InventoryItemDraft(),
            selectedPictogram = null,
            successMessage = null,
            errorMessage = null,
        )
    }

    fun startEditSelected() {
        val detail = mutableState.value.selectedDetail ?: return
        mutableState.value = mutableState.value.copy(
            isEditingItem = true,
            itemDraft = detail.toItemDraft(),
            selectedPictogram = null,
            successMessage = null,
            errorMessage = null,
        )
    }

    fun updateItemDraft(transform: (InventoryItemDraft) -> InventoryItemDraft) {
        mutableState.value = mutableState.value.copy(itemDraft = transform(mutableState.value.itemDraft))
    }

    fun attachPictogram(payload: BinaryPayload?) {
        mutableState.value = mutableState.value.copy(selectedPictogram = payload)
    }

    fun updateDraft(transform: (InventoryMovementDraft) -> InventoryMovementDraft) {
        mutableState.value = mutableState.value.copy(movementDraft = transform(mutableState.value.movementDraft))
    }

    fun saveItem() {
        val current = mutableState.value
        if (!current.itemDraft.isValid()) {
            mutableState.value = current.copy(errorMessage = "Vyplňte název, veličinu a všechny číselné hodnoty.")
            return
        }
        mutableState.value = current.copy(isSavingItem = true, errorMessage = null)
        viewModelScope.launch {
            val savedResult = current.selectedDetail?.let { repository.updateItem(it.id, current.itemDraft) }
                ?: repository.createItem(current.itemDraft)
            when (savedResult) {
                is AppResult.Success -> {
                    val finalResult = current.selectedPictogram?.let { repository.uploadPictogram(savedResult.value.id, it) }
                        ?: AppResult.Success(savedResult.value)
                    when (finalResult) {
                        is AppResult.Success -> {
                            mutableState.value = mutableState.value.copy(
                                isSavingItem = false,
                                isEditingItem = false,
                                selectedItemId = finalResult.value.id,
                                selectedDetail = finalResult.value,
                                itemDraft = finalResult.value.toItemDraft(),
                                selectedPictogram = null,
                                successMessage = if (current.selectedDetail == null) "Skladová položka byla založena." else "Skladová položka byla upravena.",
                            )
                            load()
                        }

                        is AppResult.Error -> mutableState.value = mutableState.value.copy(isSavingItem = false, errorMessage = finalResult.message)
                    }
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSavingItem = false, errorMessage = savedResult.message)
            }
        }
    }

    fun submitMovement() {
        val selectedId = mutableState.value.selectedItemId ?: run {
            mutableState.value = mutableState.value.copy(errorMessage = "Vyberte položku skladu.")
            return
        }
        val draft = mutableState.value.movementDraft
        if (!draft.isValid()) {
            mutableState.value = mutableState.value.copy(errorMessage = "Vyplňte množství a datum dokladu.")
            return
        }
        mutableState.value = mutableState.value.copy(isSavingMovement = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.submitMovement(selectedId, draft)) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSavingMovement = false,
                        selectedDetail = result.value,
                        movementDraft = InventoryMovementDraft(),
                        successMessage = "Pohyb skladu byl uložen.",
                    )
                    load()
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSavingMovement = false, errorMessage = result.message)
            }
        }
    }
}

data class InventoryUiState(
    val isLoading: Boolean = false,
    val isSavingItem: Boolean = false,
    val isSavingMovement: Boolean = false,
    val items: List<InventoryItemSummary> = emptyList(),
    val selectedItemId: Int? = null,
    val selectedDetail: InventoryItemDetail? = null,
    val movementDraft: InventoryMovementDraft = InventoryMovementDraft(),
    val itemDraft: InventoryItemDraft = InventoryItemDraft(),
    val selectedPictogram: BinaryPayload? = null,
    val isEditingItem: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
)
