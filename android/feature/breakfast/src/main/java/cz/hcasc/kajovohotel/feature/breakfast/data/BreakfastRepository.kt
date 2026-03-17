package cz.hcasc.kajovohotel.feature.breakfast.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.core.network.api.BreakfastApi
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderUpdateDto
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastImportItem
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastImportPreview
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastSummary
import cz.hcasc.kajovohotel.feature.breakfast.domain.sortedForService
import cz.hcasc.kajovohotel.feature.breakfast.domain.toCreateRequest
import cz.hcasc.kajovohotel.feature.breakfast.domain.toUpdateRequest
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class BreakfastRepository @Inject constructor(
    private val api: BreakfastApi,
    @Suppress("UNUSED_PARAMETER") private val baseUrlConfig: BaseUrlConfig,
) {
    suspend fun load(serviceDate: String): AppResult<Pair<List<BreakfastOrder>, BreakfastSummary>> {
        return try {
            val orders = api.list(serviceDate = serviceDate).map { it.toDomain() }.sortedForService()
            val summary = api.dailySummary(serviceDate).toDomain()
            AppResult.Success(orders to summary)
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst objednávky snídaní."), throwable)
        }
    }

    suspend fun create(draft: cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft): AppResult<BreakfastOrder> {
        return try {
            AppResult.Success(api.create(draft.toCreateRequest()).toDomain())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Objednávku se nepodařilo založit."), throwable)
        }
    }

    suspend fun update(orderId: Int, draft: cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft, currentStatus: BreakfastStatus): AppResult<BreakfastOrder> {
        return try {
            AppResult.Success(api.update(orderId, draft.toUpdateRequest(currentStatus)).toDomain())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Objednávku se nepodařilo uložit."), throwable)
        }
    }

    suspend fun markServed(orderId: Int): AppResult<BreakfastOrder> {
        return try {
            AppResult.Success(api.update(orderId, BreakfastOrderUpdateDto(status = BreakfastStatus.SERVED.wireValue)).toDomain())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se označit objednávku jako vydanou."), throwable)
        }
    }

    suspend fun importPreview(file: BinaryPayload, save: Boolean): AppResult<BreakfastImportPreview> {
        return try {
            val filePart = MultipartBody.Part.createFormData(
                name = "file",
                filename = file.fileName,
                body = file.bytes.toRequestBody(file.mimeType.toMediaType()),
            )
            val saveBody = save.toString().toRequestBody("text/plain".toMediaType())
            val response = api.importPdf(filePart, saveBody)
            AppResult.Success(
                BreakfastImportPreview(
                    sourceFileName = file.fileName,
                    serviceDate = response.date,
                    items = response.items.map {
                        BreakfastImportItem(
                            room = it.room,
                            count = it.count,
                            guestName = it.guest_name.orEmpty(),
                            noGluten = it.diet_no_gluten,
                            noMilk = it.diet_no_milk,
                            noPork = it.diet_no_pork,
                        )
                    },
                    saved = response.saved,
                ),
            )
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Import PDF se nepodařilo zpracovat."), throwable)
        }
    }

    suspend fun exportDaily(serviceDate: String): AppResult<Unit> {
        return try {
            val response = api.exportDaily(serviceDate)
            if (response.isSuccessful) {
                AppResult.Success(Unit)
            } else {
                AppResult.Error("Export PDF skončil chybou ${response.code()}.")
            }
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Export PDF se nepodařilo spustit."), throwable)
        }
    }
}

private fun cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderDto.toDomain() = BreakfastOrder(
    id = id,
    serviceDate = service_date,
    roomNumber = room_number,
    guestName = guest_name,
    guestCount = guest_count,
    note = note.orEmpty(),
    noGluten = diet_no_gluten,
    noMilk = diet_no_milk,
    noPork = diet_no_pork,
    status = BreakfastStatus.fromWire(status),
)

private fun cz.hcasc.kajovohotel.core.network.dto.BreakfastDailySummaryDto.toDomain() = BreakfastSummary(
    serviceDate = service_date,
    totalOrders = total_orders,
    totalGuests = total_guests,
    statusCounts = status_counts,
)
