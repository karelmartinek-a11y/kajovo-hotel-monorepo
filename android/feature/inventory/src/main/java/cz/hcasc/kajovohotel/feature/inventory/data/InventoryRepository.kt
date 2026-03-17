package cz.hcasc.kajovohotel.feature.inventory.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.model.InventoryMovementType
import cz.hcasc.kajovohotel.core.network.api.InventoryApi
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemDetail
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemSummary
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementRecord
import cz.hcasc.kajovohotel.feature.inventory.domain.toRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InventoryRepository @Inject constructor(
    private val api: InventoryApi,
) {
    suspend fun list(): AppResult<List<InventoryItemSummary>> {
        return try {
            AppResult.Success(api.list().map { it.toSummary() })
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst sklad."), throwable)
        }
    }

    suspend fun detail(itemId: Int): AppResult<InventoryItemDetail> {
        return try {
            AppResult.Success(api.detail(itemId).toDetail())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst detail skladové položky."), throwable)
        }
    }

    suspend fun submitMovement(itemId: Int, draft: InventoryMovementDraft): AppResult<InventoryItemDetail> {
        return try {
            AppResult.Success(api.addMovement(itemId, draft.toRequest()).toDetail())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se založit skladový pohyb."), throwable)
        }
    }
}

private fun cz.hcasc.kajovohotel.core.network.dto.InventoryItemDto.toSummary() = InventoryItemSummary(
    id = id,
    name = name,
    unit = unit,
    currentStock = current_stock,
    minStock = min_stock,
)

private fun cz.hcasc.kajovohotel.core.network.dto.InventoryItemDetailDto.toDetail() = InventoryItemDetail(
    id = id,
    name = name,
    unit = unit,
    currentStock = current_stock,
    minStock = min_stock,
    amountPerPieceBase = amount_per_piece_base,
    movements = movements.map { movement ->
        InventoryMovementRecord(
            id = movement.id,
            documentNumber = movement.document_number,
            documentDate = movement.document_date,
            movementType = InventoryMovementType.fromWire(movement.movement_type),
            quantity = movement.quantity,
            quantityPieces = movement.quantity_pieces,
            note = movement.note.orEmpty(),
        )
    },
)
