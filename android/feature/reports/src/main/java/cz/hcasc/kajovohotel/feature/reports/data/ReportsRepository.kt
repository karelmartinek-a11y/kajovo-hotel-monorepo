package cz.hcasc.kajovohotel.feature.reports.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.common.resolveApiPath
import cz.hcasc.kajovohotel.core.model.MediaPhoto
import cz.hcasc.kajovohotel.core.network.api.ReportsApi
import cz.hcasc.kajovohotel.core.network.dto.ReportCreateDto
import cz.hcasc.kajovohotel.core.network.dto.ReportUpdateDto
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.reports.domain.HotelReport
import cz.hcasc.kajovohotel.feature.reports.domain.ReportDraft
import cz.hcasc.kajovohotel.feature.reports.domain.ReportFilters
import cz.hcasc.kajovohotel.feature.reports.domain.ReportStatus
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReportsRepository @Inject constructor(
    private val api: ReportsApi,
    private val baseUrlConfig: BaseUrlConfig,
) {
    suspend fun list(filters: ReportFilters): AppResult<List<HotelReport>> {
        return try {
            AppResult.Success(api.list(filters.status?.wireValue).map { it.toDomain(baseUrlConfig) })
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Hlášení se nepodařilo načíst."), throwable)
        }
    }

    suspend fun create(draft: ReportDraft): AppResult<HotelReport> {
        return try {
            AppResult.Success(
                api.create(
                    ReportCreateDto(
                        title = draft.title.trim(),
                        description = draft.description.trim().ifBlank { null },
                        status = draft.status.wireValue,
                    ),
                ).toDomain(baseUrlConfig),
            )
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Hlášení se nepodařilo založit."), throwable)
        }
    }

    suspend fun update(reportId: Int, draft: ReportDraft): AppResult<HotelReport> {
        return try {
            AppResult.Success(
                api.update(
                    reportId,
                    ReportUpdateDto(
                        title = draft.title.trim(),
                        description = draft.description.trim().ifBlank { null },
                        status = draft.status.wireValue,
                    ),
                ).toDomain(baseUrlConfig),
            )
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Hlášení se nepodařilo upravit."), throwable)
        }
    }
}

private fun cz.hcasc.kajovohotel.core.network.dto.ReportDto.toDomain(baseUrlConfig: BaseUrlConfig) = HotelReport(
    id = id,
    title = title,
    description = description.orEmpty(),
    status = ReportStatus.fromWire(status),
    createdAt = created_at.orEmpty(),
    updatedAt = updated_at.orEmpty(),
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
