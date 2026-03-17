package cz.hcasc.kajovohotel.feature.issues.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.common.resolveApiPath
import cz.hcasc.kajovohotel.core.model.IssuePriority
import cz.hcasc.kajovohotel.core.model.IssueStatus
import cz.hcasc.kajovohotel.core.model.MediaPhoto
import cz.hcasc.kajovohotel.core.network.api.IssuesApi
import cz.hcasc.kajovohotel.core.network.dto.IssueUpdateDto
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.issues.domain.IssueFilters
import cz.hcasc.kajovohotel.feature.issues.domain.MaintenanceIssue
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class IssuesRepository @Inject constructor(
    private val api: IssuesApi,
    private val baseUrlConfig: BaseUrlConfig,
) {
    suspend fun list(filters: IssueFilters): AppResult<List<MaintenanceIssue>> {
        return try {
            AppResult.Success(
                api.list(
                    priority = filters.priority?.wireValue,
                    status = filters.status?.wireValue,
                    roomNumber = filters.roomNumber.ifBlank { null },
                ).map { it.toDomain(baseUrlConfig) },
            )
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst závady."), throwable)
        }
    }

    suspend fun updateStatus(issueId: Int, status: IssueStatus): AppResult<MaintenanceIssue> {
        return try {
            AppResult.Success(api.update(issueId, IssueUpdateDto(status = status.wireValue)).toDomain(baseUrlConfig))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se změnit stav závady."), throwable)
        }
    }
}

private fun cz.hcasc.kajovohotel.core.network.dto.IssueDto.toDomain(baseUrlConfig: BaseUrlConfig) = MaintenanceIssue(
    id = id,
    title = title,
    location = location,
    description = description.orEmpty(),
    roomNumber = room_number.orEmpty(),
    assignee = assignee.orEmpty(),
    status = IssueStatus.fromWire(status),
    priority = IssuePriority.fromWire(priority),
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
