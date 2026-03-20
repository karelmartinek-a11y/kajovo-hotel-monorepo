package cz.hcasc.kajovohotel.feature.inventory.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.InventoryMovementType
import cz.hcasc.kajovohotel.core.network.api.InventoryApi
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemDetail
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemDraft
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemSummary
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementRecord
import cz.hcasc.kajovohotel.feature.inventory.domain.toCreateRequest
import cz.hcasc.kajovohotel.feature.inventory.domain.toRequest
import cz.hcasc.kajovohotel.feature.inventory.domain.toUpdateRequest
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

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
            AppResult.Error(throwable.readableMessage("Detail skladové položky se nepodařilo načíst."), throwable)
        }
    }

    suspend fun createItem(draft: InventoryItemDraft): AppResult<InventoryItemDetail> {
        return try {
            val created = api.create(draft.toCreateRequest())
            AppResult.Success(api.detail(created.id).toDetail())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Skladovou položku se nepodařilo založit."), throwable)
        }
    }

    suspend fun updateItem(itemId: Int, draft: InventoryItemDraft): AppResult<InventoryItemDetail> {
        return try {
            api.update(itemId, draft.toUpdateRequest())
            AppResult.Success(api.detail(itemId).toDetail())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Skladovou položku se nepodařilo upravit."), throwable)
        }
    }

    suspend fun uploadPictogram(itemId: Int, payload: BinaryPayload): AppResult<InventoryItemDetail> {
        return try {
            val filePart = MultipartBody.Part.createFormData(
                "file",
                payload.fileName,
                payload.bytes.toRequestBody(payload.mimeType.toMediaType()),
            )
            api.uploadPictogram(itemId, filePart)
            AppResult.Success(api.detail(itemId).toDetail())
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Miniaturu položky se nepodařilo nahrát."), throwable)
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
    pictogramThumbPath = pictogram_thumb_path.orEmpty(),
)

private fun cz.hcasc.kajovohotel.core.network.dto.InventoryItemDetailDto.toDetail() = InventoryItemDetail(
    id = id,
    name = name,
    unit = unit,
    currentStock = current_stock,
    minStock = min_stock,
    amountPerPieceBase = amount_per_piece_base,
    pictogramPath = pictogram_path.orEmpty(),
    pictogramThumbPath = pictogram_thumb_path.orEmpty(),
    createdAt = created_at.orEmpty(),
    updatedAt = updated_at.orEmpty(),
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
