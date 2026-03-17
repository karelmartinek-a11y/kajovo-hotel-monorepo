package cz.hcasc.kajovohotel.feature.inventory.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.network.api.InventoryApi
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemSummary
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import cz.hcasc.kajovohotel.feature.inventory.domain.toRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InventoryRepository @Inject constructor(
    private val api: InventoryApi,
) {
    suspend fun list(): AppResult<List<InventoryItemSummary>> {
        return try {
            AppResult.Success(api.list().map { it.toDomain() })
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst sklad."), throwable)
        }
    }

    suspend fun submitMovement(itemId: Int, draft: InventoryMovementDraft): AppResult<String> {
        return try {
            val detail = api.addMovement(itemId, draft.toRequest())
            val latest = detail.movements.firstOrNull()
            AppResult.Success(latest?.document_number ?: "Pohyb byl založen.")
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se založit skladový pohyb."), throwable)
        }
    }
}

private fun cz.hcasc.kajovohotel.core.network.dto.InventoryItemDto.toDomain() = InventoryItemSummary(
    id = id,
    name = name,
    unit = unit,
    currentStock = current_stock,
    minStock = min_stock,
)
