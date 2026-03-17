package cz.hcasc.kajovohotel.feature.issues.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.model.IssuePriority
import cz.hcasc.kajovohotel.core.model.IssueStatus
import cz.hcasc.kajovohotel.core.model.allowedMaintenanceTransitions
import cz.hcasc.kajovohotel.feature.issues.data.IssuesRepository
import cz.hcasc.kajovohotel.feature.issues.domain.IssueFilters
import cz.hcasc.kajovohotel.feature.issues.domain.MaintenanceIssue
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class IssuesViewModel @Inject constructor(
    private val repository: IssuesRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(IssuesUiState())
    val state: StateFlow<IssuesUiState> = mutableState.asStateFlow()

    fun load() {
        val current = mutableState.value
        mutableState.value = current.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.list(current.filters)) {
                is AppResult.Success -> mutableState.value = mutableState.value.copy(
                    isLoading = false,
                    issues = result.value,
                    selected = result.value.firstOrNull(),
                )
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    fun updateFilters(transform: (IssueFilters) -> IssueFilters) {
        mutableState.value = mutableState.value.copy(filters = transform(mutableState.value.filters))
    }

    fun select(issue: MaintenanceIssue) {
        mutableState.value = mutableState.value.copy(selected = issue)
    }

    fun advanceStatus(target: IssueStatus) {
        val selected = mutableState.value.selected ?: return
        if (target !in allowedMaintenanceTransitions(selected.status)) {
            mutableState.value = mutableState.value.copy(errorMessage = "Backend guard nepovoluje přechod ${selected.status.label} → ${target.label}.")
            return
        }
        mutableState.value = mutableState.value.copy(isSaving = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.updateStatus(selected.id, target)) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(isSaving = false, selected = result.value, successMessage = "Stav závady byl změněn.")
                    load()
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSaving = false, errorMessage = result.message)
            }
        }
    }
}

data class IssuesUiState(
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val filters: IssueFilters = IssueFilters(),
    val issues: List<MaintenanceIssue> = emptyList(),
    val selected: MaintenanceIssue? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null,
) {
    val allowedTransitions: Set<IssueStatus>
        get() = selected?.let { allowedMaintenanceTransitions(it.status) } ?: emptySet()
}
