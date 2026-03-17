package cz.hcasc.kajovohotel.feature.housekeeping.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode
import cz.hcasc.kajovohotel.core.network.api.IssuesApi
import cz.hcasc.kajovohotel.core.network.api.LostFoundApi
import cz.hcasc.kajovohotel.core.network.dto.IssueCreateDto
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingCaptureDraft
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class HousekeepingCaptureRepository @Inject constructor(
    private val issuesApi: IssuesApi,
    private val lostFoundApi: LostFoundApi,
) {
    suspend fun submit(draft: HousekeepingCaptureDraft, photos: List<BinaryPayload>): AppResult<String> {
        return try {
            when (draft.mode) {
                HousekeepingCaptureMode.ISSUE -> {
                    val issue = issuesApi.create(
                        IssueCreateDto(
                            title = "Pokoj ${draft.roomNumber}",
                            location = draft.location,
                            description = draft.description,
                            room_number = draft.roomNumber,
                        ),
                    )
                    if (photos.isNotEmpty()) {
                        issuesApi.uploadPhotos(issue.id, photos.take(3).mapIndexed { index, payload -> payload.toPart(index) })
                    }
                    AppResult.Success("Závada #${issue.id}")
                }
                HousekeepingCaptureMode.LOST_FOUND -> {
                    val item = lostFoundApi.create(
                        cz.hcasc.kajovohotel.core.network.dto.LostFoundItemCreateDto(
                            description = draft.description,
                            category = "Housekeeping",
                            location = draft.location,
                            event_at = java.time.LocalDate.now().toString(),
                            room_number = draft.roomNumber,
                        ),
                    )
                    if (photos.isNotEmpty()) {
                        lostFoundApi.uploadPhotos(item.id, photos.take(3).mapIndexed { index, payload -> payload.toPart(index) })
                    }
                    AppResult.Success("Nález #${item.id}")
                }
            }
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se odeslat housekeeping quick capture."), throwable)
        }
    }
}

private fun BinaryPayload.toPart(index: Int): MultipartBody.Part = MultipartBody.Part.createFormData(
    name = "photos",
    filename = if (fileName.isBlank()) "capture_${index + 1}.jpg" else fileName,
    body = bytes.toRequestBody(mimeType.toMediaType()),
)
