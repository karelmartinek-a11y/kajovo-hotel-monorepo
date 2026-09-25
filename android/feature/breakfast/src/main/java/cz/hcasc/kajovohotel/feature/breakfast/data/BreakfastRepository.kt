package cz.hcasc.kajovohotel.feature.breakfast.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.core.network.api.BreakfastApi
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderUpdateDto
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrderDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastSummary
import cz.hcasc.kajovohotel.feature.breakfast.domain.sortedForService
import cz.hcasc.kajovohotel.feature.breakfast.domain.toQueuedDraftUpdate
import cz.hcasc.kajovohotel.feature.breakfast.domain.toCreateRequest
import cz.hcasc.kajovohotel.feature.breakfast.domain.toUpdateRequest
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.ResponseBody

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

    suspend fun update(orderId: Int, draft: cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft): AppResult<BreakfastOrder> {
        return try {
            AppResult.Success(api.update(orderId, draft.toUpdateRequest()).toDomain())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Objednávku se nepodařilo uložit."), throwable)
        }
    }

    suspend fun detail(orderId: Int): AppResult<BreakfastOrder> {
        return try {
            AppResult.Success(api.detail(orderId).toDomain())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst detail snídaně."), throwable)
        }
    }

    suspend fun markServed(orderId: Int): AppResult<BreakfastOrder> {
        return try {
            AppResult.Success(api.update(orderId, BreakfastOrderUpdateDto(status = BreakfastStatus.SERVED.wireValue)).toDomain())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se označit objednávku jako vydanou."), throwable)
        }
    }

    suspend fun applyQueuedDraft(order: BreakfastOrder, draft: BreakfastOrderDraft): AppResult<BreakfastOrder> {
        return try {
            AppResult.Success(api.update(order.id, order.toQueuedDraftUpdate(draft)).toDomain())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se uložit rozpracovanou změnu snídaně."), throwable)
        }
    }

    suspend fun exportDaily(serviceDate: String): AppResult<BinaryPayload> {
        return try {
            val response = api.exportDaily(serviceDate)
            if (!response.isSuccessful) {
                AppResult.Error("Export PDF skončil chybou ${response.code()}.")
            } else {
                val body = response.body() ?: return AppResult.Error("Export PDF nevrátil žádný soubor.")
                AppResult.Success(
                    BinaryPayload(
                        fileName = response.fileNameOrDefault(serviceDate),
                        mimeType = body.contentType()?.toString() ?: "application/pdf",
                        bytes = body.bytes(),
                    ),
                )
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
    guestNames = guest_names,
    countryCode = country_code,
    guestCount = guest_count,
    note = note.orEmpty(),
    noGluten = diet_no_gluten,
    noMilk = diet_no_milk,
    noPork = diet_no_pork,
    status = BreakfastStatus.fromWire(status),
    createdAt = created_at,
    updatedAt = updated_at,
)

private fun cz.hcasc.kajovohotel.core.network.dto.BreakfastDailySummaryDto.toDomain() = BreakfastSummary(
    serviceDate = service_date,
    totalOrders = total_orders,
    totalGuests = total_guests,
    statusCounts = status_counts,
    sourceImportedAt = source_imported_at,
)

private fun retrofit2.Response<ResponseBody>.fileNameOrDefault(serviceDate: String): String {
    val headerValue = headers()["Content-Disposition"].orEmpty()
    val headerFileName = headerValue
        .split(';')
        .map(String::trim)
        .firstOrNull { it.startsWith("filename=", ignoreCase = true) }
        ?.substringAfter('=')
        ?.trim('"')
    return headerFileName?.takeIf(String::isNotBlank) ?: "snidane-$serviceDate.pdf"
}
