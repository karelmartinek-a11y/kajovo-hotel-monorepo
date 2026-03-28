package cz.hcasc.kajovohotel.feature.breakfast.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.breakfast.data.BreakfastRepository
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDietKey
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastImportPreview
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrderDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastSummary
import cz.hcasc.kajovohotel.feature.breakfast.domain.applyDraft
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
                    val selectedOrder = if (role == PortalRole.RECEPTION) {
                        mutableState.value.selectedOrder?.let { selected -> result.value.first.firstOrNull { it.id == selected.id } }
                            ?: result.value.first.firstOrNull()
                    } else {
                        null
                    }
                    mutableState.value = mutableState.value.copy(
                        isLoading = false,
                        orders = result.value.first,
                        summary = result.value.second,
                        selectedOrder = selectedOrder,
                        queuedDrafts = emptyMap(),
                        importPreview = null,
                        pendingImportFile = null,
                        draft = if (mutableState.value.isCreatingNew) {
                            BreakfastDraft(serviceDate = serviceDate)
                        } else {
                            selectedOrder?.toDraft() ?: BreakfastDraft(serviceDate = serviceDate)
                        },
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

    fun setSearchQuery(value: String) {
        mutableState.value = mutableState.value.copy(searchQuery = value)
    }

    fun discardQueuedDrafts() {
        mutableState.value = mutableState.value.copy(queuedDrafts = emptyMap(), successMessage = null)
    }

    fun clearExportFile() {
        mutableState.value = mutableState.value.copy(exportFile = null, exportMessage = null)
    }

    fun selectOrder(order: BreakfastOrder) {
        if (mutableState.value.role != PortalRole.RECEPTION) {
            return
        }
        mutableState.value = mutableState.value.copy(
            selectedOrder = order,
            draft = order.toDraft(),
            importPreview = null,
            pendingImportFile = null,
            exportMessage = null,
            isCreatingNew = false,
        )
    }

    fun selectOrderById(orderId: Int?) {
        if (mutableState.value.role != PortalRole.RECEPTION || orderId == null) {
            return
        }
        if (mutableState.value.selectedOrder?.id == orderId) {
            return
        }
        mutableState.value.orders.firstOrNull { it.id == orderId }?.let(::selectOrder) ?: loadOrderDetail(orderId)
    }

    fun startCreate() {
        val serviceDate = mutableState.value.serviceDate.ifBlank { defaultServiceDate() }
        mutableState.value = mutableState.value.copy(
            selectedOrder = null,
            draft = BreakfastDraft(serviceDate = serviceDate),
            importPreview = null,
            pendingImportFile = null,
            exportMessage = null,
            successMessage = null,
            errorMessage = null,
            isCreatingNew = true,
        )
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
            val result = current.selectedOrder?.let { repository.update(it.id, current.draft) } ?: repository.create(current.draft)
            when (result) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSubmitting = false,
                        selectedOrder = result.value,
                        draft = result.value.toDraft(),
                        successMessage = "Objednávka byla uložena.",
                        isCreatingNew = false,
                    )
                    load(mutableState.value.role, mutableState.value.serviceDate)
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    fun markServed(orderId: Int) {
        if (mutableState.value.role != PortalRole.RECEPTION) {
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
            return
        }
        updateQueuedDraft(orderId) { current -> current.copy(status = BreakfastStatus.SERVED) }
    }

    fun returnToPending(orderId: Int) {
        if (mutableState.value.role != PortalRole.RECEPTION) {
            return
        }
        updateQueuedDraft(orderId) { current -> current.copy(status = BreakfastStatus.PENDING) }
    }

    fun toggleQueuedDiet(orderId: Int, dietKey: BreakfastDietKey) {
        val order = mutableState.value.orders.firstOrNull { it.id == orderId } ?: return
        val effectiveOrder = order.applyDraft(mutableState.value.queuedDrafts[orderId])
        updateQueuedDraft(orderId) { current ->
            when (dietKey) {
                BreakfastDietKey.NO_GLUTEN -> current.copy(noGluten = !effectiveOrder.noGluten)
                BreakfastDietKey.NO_MILK -> current.copy(noMilk = !effectiveOrder.noMilk)
                BreakfastDietKey.NO_PORK -> current.copy(noPork = !effectiveOrder.noPork)
            }
        }
    }

    fun saveQueuedDrafts() {
        val current = mutableState.value
        val dirtyOrders = current.orders.mapNotNull { order ->
            current.queuedDrafts[order.id]
                ?.takeUnless(BreakfastOrderDraft::isEmpty)
                ?.let { draft -> order to draft }
        }
        if (dirtyOrders.isEmpty()) return
        mutableState.value = current.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            for ((order, draft) in dirtyOrders) {
                when (val result = repository.applyQueuedDraft(order, draft)) {
                    is AppResult.Success -> Unit
                    is AppResult.Error -> {
                        mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
                        return@launch
                    }
                }
            }
            mutableState.value = mutableState.value.copy(
                isSubmitting = false,
                queuedDrafts = emptyMap(),
                successMessage = "Rozpracované změny snídaní byly uloženy.",
            )
            load(mutableState.value.role, mutableState.value.serviceDate)
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
                    pendingImportFile = file,
                    successMessage = "Import byl analyzován.",
                )

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    fun toggleImportDiet(index: Int, dietKey: BreakfastDietKey) {
        val preview = mutableState.value.importPreview ?: return
        if (index !in preview.items.indices) return
        val updatedItems = preview.items.mapIndexed { currentIndex, item ->
            if (currentIndex != index) {
                item
            } else {
                when (dietKey) {
                    BreakfastDietKey.NO_GLUTEN -> item.copy(noGluten = !item.noGluten)
                    BreakfastDietKey.NO_MILK -> item.copy(noMilk = !item.noMilk)
                    BreakfastDietKey.NO_PORK -> item.copy(noPork = !item.noPork)
                }
            }
        }
        mutableState.value = mutableState.value.copy(importPreview = preview.copy(items = updatedItems))
    }

    fun confirmImport() {
        val file = mutableState.value.pendingImportFile
        if (file == null) {
            mutableState.value = mutableState.value.copy(errorMessage = "Nejprve nahrajte PDF se snídaněmi.")
            return
        }
        if (mutableState.value.role != PortalRole.RECEPTION) {
            mutableState.value = mutableState.value.copy(errorMessage = "Import snídaní je dostupný jen pro recepci.")
            return
        }
        mutableState.value = mutableState.value.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.importPreview(file, save = true, overrides = mutableState.value.importPreview?.items.orEmpty())) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSubmitting = false,
                        selectedOrder = null,
                        importPreview = null,
                        pendingImportFile = null,
                        successMessage = "Import byl potvrzen a uložen.",
                        isCreatingNew = false,
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
                    exportFile = result.value,
                    exportMessage = "Export PDF je připravený pro otevření, sdílení nebo uložení.",
                )

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    private fun defaultServiceDate(): String = java.time.LocalDate.now().toString()

    private fun loadOrderDetail(orderId: Int) {
        val current = mutableState.value
        mutableState.value = current.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.detail(orderId)) {
                is AppResult.Success -> {
                    val detail = result.value
                    mutableState.value = mutableState.value.copy(
                        isLoading = false,
                        selectedOrder = detail,
                        draft = detail.toDraft(),
                        serviceDate = detail.serviceDate,
                        importPreview = null,
                        pendingImportFile = null,
                        exportMessage = null,
                        isCreatingNew = false,
                    )
                    load(mutableState.value.role, detail.serviceDate)
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    private fun updateQueuedDraft(orderId: Int, transform: (BreakfastOrderDraft) -> BreakfastOrderDraft) {
        val current = mutableState.value
        val order = current.orders.firstOrNull { it.id == orderId } ?: return
        val nextDraft = transform(current.queuedDrafts[orderId] ?: BreakfastOrderDraft())
        val nextQueuedDrafts = current.queuedDrafts.toMutableMap()
        val effective = order.applyDraft(nextDraft)
        val changed = effective.status != order.status ||
            effective.noGluten != order.noGluten ||
            effective.noMilk != order.noMilk ||
            effective.noPork != order.noPork
        if (nextDraft.isEmpty() || !changed) {
            nextQueuedDrafts.remove(orderId)
        } else {
            nextQueuedDrafts[orderId] = nextDraft
        }
        mutableState.value = current.copy(queuedDrafts = nextQueuedDrafts, errorMessage = null, successMessage = null)
    }
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
    val pendingImportFile: BinaryPayload? = null,
    val exportFile: BinaryPayload? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null,
    val exportMessage: String? = null,
    val isCreatingNew: Boolean = false,
    val searchQuery: String = "",
    val queuedDrafts: Map<Int, BreakfastOrderDraft> = emptyMap(),
)
