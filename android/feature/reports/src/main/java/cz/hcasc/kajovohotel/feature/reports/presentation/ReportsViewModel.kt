package cz.hcasc.kajovohotel.feature.reports.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.feature.reports.data.ReportsRepository
import cz.hcasc.kajovohotel.feature.reports.domain.HotelReport
import cz.hcasc.kajovohotel.feature.reports.domain.ReportDraft
import cz.hcasc.kajovohotel.feature.reports.domain.ReportFilters
import cz.hcasc.kajovohotel.feature.reports.domain.toDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class ReportsViewModel @Inject constructor(
    private val repository: ReportsRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ReportsUiState())
    val state: StateFlow<ReportsUiState> = mutableState.asStateFlow()

    fun load(selectedReportId: Int? = mutableState.value.selected?.id, draftOverride: ReportDraft? = null) {
        val current = mutableState.value
        mutableState.value = current.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.list(current.filters)) {
                is AppResult.Success -> {
                    val selected = selectedReportId?.let { id -> result.value.firstOrNull { it.id == id } }
                        ?: result.value.firstOrNull()
                    mutableState.value = mutableState.value.copy(
                        isLoading = false,
                        reports = result.value,
                        selected = selected,
                        draft = draftOverride ?: selected?.toDraft() ?: ReportDraft(),
                    )
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    fun updateFilters(transform: (ReportFilters) -> ReportFilters) {
        mutableState.value = mutableState.value.copy(filters = transform(mutableState.value.filters))
    }

    fun startCreate() {
        mutableState.value = mutableState.value.copy(selected = null, draft = ReportDraft(), successMessage = null, errorMessage = null)
    }

    fun select(report: HotelReport) {
        mutableState.value = mutableState.value.copy(selected = report, draft = report.toDraft(), successMessage = null)
    }

    fun updateDraft(transform: (ReportDraft) -> ReportDraft) {
        mutableState.value = mutableState.value.copy(draft = transform(mutableState.value.draft))
    }

    fun save() {
        val current = mutableState.value
        if (!current.draft.isValid()) {
            mutableState.value = current.copy(errorMessage = "Vyplňte název hlášení alespoň o třech znacích.")
            return
        }
        mutableState.value = current.copy(isSaving = true, errorMessage = null)
        viewModelScope.launch {
            val result = current.selected?.let { repository.update(it.id, current.draft) } ?: repository.create(current.draft)
            when (result) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSaving = false,
                        selected = result.value,
                        draft = result.value.toDraft(),
                        successMessage = if (current.selected == null) "Hlášení bylo založeno." else "Hlášení bylo upraveno.",
                    )
                    load(result.value.id, result.value.toDraft())
                }

                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSaving = false, errorMessage = result.message)
            }
        }
    }
}

data class ReportsUiState(
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val filters: ReportFilters = ReportFilters(),
    val reports: List<HotelReport> = emptyList(),
    val selected: HotelReport? = null,
    val draft: ReportDraft = ReportDraft(),
    val errorMessage: String? = null,
    val successMessage: String? = null,
) {
    val isEditingExisting: Boolean
        get() = selected != null
}
