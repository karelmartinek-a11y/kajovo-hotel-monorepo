package cz.hcasc.kajovohotel.feature.housekeeping.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.canCreateIssueFromHousekeeping
import cz.hcasc.kajovohotel.core.model.canCreateLostFoundFromHousekeeping
import cz.hcasc.kajovohotel.feature.housekeeping.data.HousekeepingCaptureRepository
import cz.hcasc.kajovohotel.feature.housekeeping.data.HousekeepingDraftStore
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingCaptureDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@HiltViewModel
class HousekeepingViewModel @Inject constructor(
    private val repository: HousekeepingCaptureRepository,
    private val draftStore: HousekeepingDraftStore,
) : ViewModel() {
    private val mutableState = MutableStateFlow(HousekeepingUiState())
    val state: StateFlow<HousekeepingUiState> = mutableState.asStateFlow()

    init {
        viewModelScope.launch {
            val storedDraft = draftStore.load() ?: return@launch
            mutableState.value = mutableState.value.copy(
                draft = storedDraft.draft,
                pendingPhotos = storedDraft.photos,
                draftNotice = "Obnoven lokální koncept z ${draftTimestampFormatter.format(Instant.ofEpochMilli(storedDraft.updatedAtMillis))}.",
            )
        }
    }

    fun configure(role: PortalRole, permissions: Set<String>) {
        mutableState.value = mutableState.value.copy(
            canCreateIssue = canCreateIssueFromHousekeeping(role, permissions),
            canCreateLostFound = canCreateLostFoundFromHousekeeping(role, permissions),
        )
    }

    fun updateDraft(transform: (HousekeepingCaptureDraft) -> HousekeepingCaptureDraft) {
        mutableState.value = mutableState.value.copy(
            draft = transform(mutableState.value.draft),
            successReference = null,
        )
        persistDraft()
    }

    fun appendPendingPhotos(photos: List<BinaryPayload>) {
        if (photos.isEmpty()) return
        val mergedPhotos = (mutableState.value.pendingPhotos + photos)
            .distinctBy { payload -> payload.fileName + payload.bytes.size }
        mutableState.value = mutableState.value.copy(
            pendingPhotos = mergedPhotos.take(3),
            photoLimitMessage = if (mergedPhotos.size > 3) "Lze připojit nejvýše 3 fotografie." else null,
        )
        persistDraft()
    }

    fun removePendingPhoto(index: Int) {
        val current = mutableState.value
        if (index !in current.pendingPhotos.indices) return
        mutableState.value = current.copy(
            pendingPhotos = current.pendingPhotos.filterIndexed { currentIndex, _ -> currentIndex != index },
            photoLimitMessage = null,
        )
        persistDraft()
    }

    fun clearPendingPhotos() {
        mutableState.value = mutableState.value.copy(
            pendingPhotos = emptyList(),
            photoLimitMessage = null,
        )
        persistDraft()
    }

    fun submit() {
        val current = mutableState.value
        if (!current.draft.isValid()) {
            mutableState.value = current.copy(errorMessage = "Vyplňte pokoj a krátký popis.")
            return
        }
        if (current.draft.mode == HousekeepingCaptureMode.ISSUE && !current.canCreateIssue) {
            mutableState.value = current.copy(errorMessage = "Aktivní role nemá oprávnění pro založení závady.")
            return
        }
        if (current.draft.mode == HousekeepingCaptureMode.LOST_FOUND && !current.canCreateLostFound) {
            mutableState.value = current.copy(errorMessage = "Aktivní role nemá oprávnění pro založení nálezu.")
            return
        }
        mutableState.value = current.copy(isSubmitting = true, errorMessage = null)
        viewModelScope.launch {
            when (val result = repository.submit(current.draft, current.pendingPhotos)) {
                is AppResult.Success -> {
                    draftStore.clear()
                    mutableState.value = HousekeepingUiState(
                        draft = HousekeepingCaptureDraft(mode = current.draft.mode),
                        successReference = result.value,
                        canCreateIssue = current.canCreateIssue,
                        canCreateLostFound = current.canCreateLostFound,
                    )
                }
                is AppResult.Error -> mutableState.value = current.copy(isSubmitting = false, errorMessage = result.message)
            }
        }
    }

    private fun persistDraft() {
        val current = mutableState.value
        viewModelScope.launch {
            draftStore.save(current.draft, current.pendingPhotos)
        }
    }
}

data class HousekeepingUiState(
    val draft: HousekeepingCaptureDraft = HousekeepingCaptureDraft(),
    val pendingPhotos: List<BinaryPayload> = emptyList(),
    val canCreateIssue: Boolean = true,
    val canCreateLostFound: Boolean = true,
    val isSubmitting: Boolean = false,
    val successReference: String? = null,
    val errorMessage: String? = null,
    val photoLimitMessage: String? = null,
    val draftNotice: String = "Rozpracovaný záznam se ukládá lokálně v tomto zařízení včetně nově pořízených fotek.",
)

private val draftTimestampFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d. M. yyyy HH:mm").withZone(ZoneId.systemDefault())
