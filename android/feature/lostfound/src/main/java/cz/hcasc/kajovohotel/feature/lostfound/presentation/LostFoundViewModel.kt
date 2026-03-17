package cz.hcasc.kajovohotel.feature.lostfound.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.LostFoundStatus
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.lostfound.data.LostFoundRepository
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundDraft
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundFilters
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundRecord
import cz.hcasc.kajovohotel.feature.lostfound.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.lostfound.domain.toDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class LostFoundViewModel @Inject constructor(
    private val repository: LostFoundRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(LostFoundUiState())
    val state: StateFlow<LostFoundUiState> = mutableState.asStateFlow()

    fun configure(role: PortalRole) {
        mutableState.value = mutableState.value.copy(
            isReceptionView = role == PortalRole.RECEPTION,
            filters = if (role == PortalRole.RECEPTION) {
                mutableState.value.filters.copy(status = LostFoundStatus.NEW)
            } else {
                mutableState.value.filters
            },
        )
    }

    fun load() {
        val current = mutableState.value
        mutableState.value = current.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.list(current.filters)) {
                is AppResult.Success -> {
                    val records = if (current.isReceptionView) {
                        result.value.filter { it.status == LostFoundStatus.NEW }
                    } else {
                        result.value
                    }
                    mutableState.value = mutableState.value.copy(
                        isLoading = false,
                        records = records,
                        selected = records.firstOrNull(),
                        draft = records.firstOrNull()?.toDraft() ?: LostFoundDraft(),
                    )
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isLoading = false, errorMessage = result.message)
            }
        }
    }

    fun updateFilters(transform: (LostFoundFilters) -> LostFoundFilters) {
        mutableState.value = mutableState.value.copy(filters = transform(mutableState.value.filters))
    }

    fun select(record: LostFoundRecord) {
        mutableState.value = mutableState.value.copy(selected = record, draft = record.toDraft(), successMessage = null)
    }

    fun startCreate() {
        mutableState.value = mutableState.value.copy(selected = null, draft = LostFoundDraft(), pendingPhotos = emptyList(), successMessage = null, errorMessage = null)
    }

    fun updateDraft(transform: (LostFoundDraft) -> LostFoundDraft) {
        mutableState.value = mutableState.value.copy(draft = transform(mutableState.value.draft))
    }

    fun setPendingPhotos(photos: List<BinaryPayload>) {
        mutableState.value = mutableState.value.copy(pendingPhotos = photos.take(3))
    }

    fun markProcessed(record: LostFoundRecord) {
        mutableState.value = mutableState.value.copy(isSaving = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.markProcessed(record)) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSaving = false,
                        records = mutableState.value.records.filterNot { it.id == record.id },
                        selected = mutableState.value.selected?.takeIf { it.id != record.id },
                        successMessage = "Nález byl označen jako zpracovaný.",
                    )
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSaving = false, errorMessage = result.message)
            }
        }
    }

    fun save() {
        val current = mutableState.value
        if (!current.draft.isValidForSubmit()) {
            mutableState.value = current.copy(errorMessage = "Vyplňte kategorii, popis, místo a datum události.")
            return
        }
        mutableState.value = current.copy(isSaving = true, errorMessage = null)
        viewModelScope.launch {
            val result = current.selected?.let { repository.update(it.id, current.draft, current.pendingPhotos) }
                ?: repository.create(current.draft, current.pendingPhotos)
            when (result) {
                is AppResult.Success -> {
                    mutableState.value = mutableState.value.copy(
                        isSaving = false,
                        selected = result.value,
                        draft = result.value.toDraft(),
                        pendingPhotos = emptyList(),
                        successMessage = "Záznam byl uložen.",
                    )
                    load()
                }
                is AppResult.Error -> mutableState.value = mutableState.value.copy(isSaving = false, errorMessage = result.message)
            }
        }
    }
}

data class LostFoundUiState(
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val isReceptionView: Boolean = false,
    val filters: LostFoundFilters = LostFoundFilters(),
    val records: List<LostFoundRecord> = emptyList(),
    val selected: LostFoundRecord? = null,
    val draft: LostFoundDraft = LostFoundDraft(),
    val pendingPhotos: List<BinaryPayload> = emptyList(),
    val errorMessage: String? = null,
    val successMessage: String? = null,
)
