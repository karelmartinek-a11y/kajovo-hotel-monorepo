package cz.hcasc.kajovohotel.feature.lostfound.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.common.resolveApiPath
import cz.hcasc.kajovohotel.core.model.LostFoundItemType
import cz.hcasc.kajovohotel.core.model.LostFoundStatus
import cz.hcasc.kajovohotel.core.model.MediaPhoto
import cz.hcasc.kajovohotel.core.network.api.LostFoundApi
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundDraft
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundFilters
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundRecord
import cz.hcasc.kajovohotel.feature.lostfound.domain.toCreateRequest
import cz.hcasc.kajovohotel.feature.lostfound.domain.toUpdateRequest
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class LostFoundRepository @Inject constructor(
    private val api: LostFoundApi,
    private val baseUrlConfig: BaseUrlConfig,
) {
    suspend fun list(filters: LostFoundFilters): AppResult<List<LostFoundRecord>> {
        return try {
            AppResult.Success(
                api.list(
                    itemType = filters.itemType?.wireValue,
                    status = filters.status?.wireValue,
                    category = filters.category.ifBlank { null },
                ).map { it.toDomain(baseUrlConfig) },
            )
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst ztráty a nálezy."), throwable)
        }
    }

    suspend fun create(draft: LostFoundDraft, photos: List<BinaryPayload>): AppResult<LostFoundRecord> {
        return try {
            val created = api.create(draft.toCreateRequest())
            if (photos.isNotEmpty()) {
                api.uploadPhotos(created.id, photos.take(3).mapIndexed { index, payload -> payload.toPart(index) })
            }
            AppResult.Success(api.detail(created.id).toDomain(baseUrlConfig))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Záznam se nepodařilo založit."), throwable)
        }
    }

    suspend fun update(recordId: Int, draft: LostFoundDraft, photos: List<BinaryPayload>): AppResult<LostFoundRecord> {
        return try {
            api.update(recordId, draft.toUpdateRequest())
            if (photos.isNotEmpty()) {
                api.uploadPhotos(recordId, photos.take(3).mapIndexed { index, payload -> payload.toPart(index) })
            }
            AppResult.Success(api.detail(recordId).toDomain(baseUrlConfig))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Záznam se nepodařilo uložit."), throwable)
        }
    }

    suspend fun markProcessed(record: LostFoundRecord): AppResult<LostFoundRecord> {
        return try {
            api.update(
                record.id,
                record.toProcessedRequest(),
            )
            AppResult.Success(api.detail(record.id).toDomain(baseUrlConfig))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se označit nález jako zpracovaný."), throwable)
        }
    }
}

private fun BinaryPayload.toPart(index: Int): MultipartBody.Part = MultipartBody.Part.createFormData(
    name = "photos",
    filename = if (fileName.isBlank()) "photo_${index + 1}.jpg" else fileName,
    body = bytes.toRequestBody(mimeType.toMediaType()),
)

private fun cz.hcasc.kajovohotel.core.network.dto.LostFoundItemDto.toDomain(baseUrlConfig: BaseUrlConfig) = LostFoundRecord(
    id = id,
    category = category,
    description = description,
    location = location,
    eventAt = event_at,
    itemType = LostFoundItemType.fromWire(item_type),
    status = LostFoundStatus.fromWire(status),
    roomNumber = room_number.orEmpty(),
    claimantName = claimant_name.orEmpty(),
    claimantContact = claimant_contact.orEmpty(),
    handoverNote = handover_note.orEmpty(),
    tags = tags,
    photos = photos.map { photo ->
        MediaPhoto(
            id = photo.id,
            thumbUrl = baseUrlConfig.resolveApiPath(photo.thumb_path),
            fullUrl = baseUrlConfig.resolveApiPath(photo.file_path),
            mimeType = photo.mime_type,
            sizeBytes = photo.size_bytes,
        )
    },
)

private fun LostFoundRecord.toProcessedRequest() = cz.hcasc.kajovohotel.core.network.dto.LostFoundItemUpdateDto(
    description = description,
    category = category,
    location = location,
    event_at = eventAt,
    item_type = itemType.wireValue,
    status = LostFoundStatus.CLAIMED.wireValue,
    room_number = roomNumber.ifBlank { null },
    claimant_name = claimantName.ifBlank { null },
    claimant_contact = claimantContact.ifBlank { null },
    handover_note = handoverNote.ifBlank { null },
    tags = tags,
)
