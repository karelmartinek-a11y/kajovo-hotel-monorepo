package cz.hcasc.kajovohotel.feature.breakfast.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.breakfast.data.BreakfastRepository
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastImportPreview
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastSummary
import cz.hcasc.kajovohotel.feature.breakfast.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.breakfast.domain.toDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class BreakfastViewModel @Inject constructor(
    private val repository: BreakfastRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(BreakfastUiState())
    val state: StateFlow<BreakfastUiState> = mutableState.asStateFlow()

    fun load(role: PortalRole, serviceDate: String = mutableState.value.serviceDate.ifBlank { defaultServiceDate() }) {
        mutableState.value = mutableState.value.copy(role = role, serviceDate = serviceDate, isLoading = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.load(serviceDate)) {
                is AppResult.Success -> {
                    val selectedOrder = if (role == PortalRole.RECEPTION) result.value.first.firstOrNull() else null
                    mutableState.value = mutableState.value.copy(
                        isLoading = false,
                        orders = result.value.first,
                        summary = result.value.second,
                        selectedOrder = selectedOrder,
                        draft = selectedOrder?.toDraft() ?: BreakfastDraft(serviceDate = serviceDate),
                        errorMessage = null,
                    )
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    fun setServiceDate(value: String) {
        mutableState.value = mutableState.value.copy(serviceDate = value)
    }

    fun selectOrder(order: BreakfastOrder) {
        if (mutableState.value.role != PortalRole.RECEPTION) {
            return
        }
        mutableState.value = mutableState.value.copy(selectedOrder = order, draft = order.toDraft(), importPreview = null, exportMessage = null)
    }

    fun updateDraft(transform: (BreakfastDraft) -> BreakfastDraft) {
        mutableState.value = mutableState.value.copy(draft = transform(mutableState.value.draft))
    }

    fun createOrUpdate() {
        val current = mutableState.value
        if (current.role != PortalRole.RECEPTION) {
            mutableState.value = current.copy(errorMessage = "Snídaňový servis může objednávky jen zobrazovat a vydávat.")
            return
        }
        if (!current.draft.isValidForSubmit()) {
            mutableState.value = current.copy(errorMessage = "Vyplňte datum, pokoj, hosta a počet.")
            return
        }
        mutableState.value = current.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            val result = current.selectedOrder?.let { repository.update(it.id, current.draft, it.status) } ?: repository.create(current.draft)
            when (result) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSubmitting = false,
                        selectedOrder = result.value,
                        draft = result.value.toDraft(),
                        successMessage = "Objednávka byla uložena.",
                    )
                    load(mutableState.value.role, mutableState.value.serviceDate)
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    fun markServed(orderId: Int) {
        mutableState.value = mutableState.value.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.markServed(orderId)) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(isSubmitting = false, successMessage = "Objednávka byla označena jako vydaná.")
                    load(mutableState.value.role, mutableState.value.serviceDate)
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    fun importPreview(file: BinaryPayload) {
        if (mutableState.value.role != PortalRole.RECEPTION) {
            mutableState.value = mutableState.value.copy(errorMessage = "Import snídaní je dostupný jen pro recepci.")
            return
        }
        mutableState.value = mutableState.value.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.importPreview(file, save = false)) {
                is AppResult.Success -> mutableState.value = mutableState.value.copy(
                    isSubmitting = false,
                    importPreview = result.value,
                    successMessage = "Import byl analyzován.",
                )
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    fun confirmImport(file: BinaryPayload) {
        if (mutableState.value.role != PortalRole.RECEPTION) {
            mutableState.value = mutableState.value.copy(errorMessage = "Import snídaní je dostupný jen pro recepci.")
            return
        }
        mutableState.value = mutableState.value.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.importPreview(file, save = true)) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSubmitting = false,
                        importPreview = result.value,
                        successMessage = "Import byl potvrzen a uložen.",
                    )
                    load(mutableState.value.role, result.value.serviceDate)
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    fun triggerExport() {
        val serviceDate = mutableState.value.serviceDate
        if (mutableState.value.role != PortalRole.RECEPTION) {
            mutableState.value = mutableState.value.copy(errorMessage = "Export snídaní je dostupný jen pro recepci.")
            return
        }
        if (serviceDate.isBlank()) {
            mutableState.value = mutableState.value.copy(errorMessage = "Pro export vyplňte datum služby.")
            return
        }
        mutableState.value = mutableState.value.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.exportDaily(serviceDate)) {
                is AppResult.Success -> mutableState.value = mutableState.value.copy(
                    isSubmitting = false,
                    exportMessage = "Export PDF byl spuštěn na serveru.",
                )
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    private fun defaultServiceDate(): String = java.time.LocalDate.now().toString()
}

data class BreakfastUiState(
    val role: PortalRole = PortalRole.BREAKFAST,
    val serviceDate: String = java.time.LocalDate.now().toString(),
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val orders: List<BreakfastOrder> = emptyList(),
    val summary: BreakfastSummary? = null,
    val selectedOrder: BreakfastOrder? = null,
    val draft: BreakfastDraft = BreakfastDraft(serviceDate = java.time.LocalDate.now().toString()),
    val importPreview: BreakfastImportPreview? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null,
    val exportMessage: String? = null,
)
