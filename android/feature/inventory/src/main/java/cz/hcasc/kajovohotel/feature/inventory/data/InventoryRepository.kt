package cz.hcasc.kajovohotel.feature.inventory.data

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.common.resolveApiPath
import cz.hcasc.kajovohotel.core.model.InventoryMovementType
import cz.hcasc.kajovohotel.core.network.api.InventoryApi
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDetailDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDto
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
    private val baseUrlConfig: BaseUrlConfig,
) {
    suspend fun list(): AppResult<List<InventoryItemSummary>> {
        return try {
            AppResult.Success(api.list().map(::toSummary))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se načíst sklad."), throwable)
        }
    }

    suspend fun detail(itemId: Int): AppResult<InventoryItemDetail> {
        return try {
            AppResult.Success(toDetail(api.detail(itemId)))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Detail skladové položky se nepodařilo načíst."), throwable)
        }
    }

    suspend fun createItem(draft: InventoryItemDraft): AppResult<InventoryItemDetail> {
        return try {
            val created = api.create(draft.toCreateRequest())
            AppResult.Success(toDetail(api.detail(created.id)))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Skladovou položku se nepodařilo založit."), throwable)
        }
    }

    suspend fun updateItem(itemId: Int, draft: InventoryItemDraft): AppResult<InventoryItemDetail> {
        return try {
            api.update(itemId, draft.toUpdateRequest())
            AppResult.Success(toDetail(api.detail(itemId)))
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
            AppResult.Success(toDetail(api.detail(itemId)))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Miniaturu položky se nepodařilo nahrát."), throwable)
        }
    }

    suspend fun submitMovement(itemId: Int, draft: InventoryMovementDraft): AppResult<InventoryItemDetail> {
        return try {
            AppResult.Success(toDetail(api.addMovement(itemId, draft.toRequest())))
        } catch (throwable: Throwable) {
            AppResult.Error(throwable.readableMessage("Nepodařilo se založit skladový pohyb."), throwable)
        }
    }

    private fun toSummary(dto: InventoryItemDto) = InventoryItemSummary(
        id = dto.id,
        name = dto.name,
        unit = dto.unit,
        currentStock = dto.current_stock,
        minStock = dto.min_stock,
        pictogramThumbPath = dto.pictogram_thumb_path?.let(baseUrlConfig::resolveApiPath).orEmpty(),
    )

    private fun toDetail(dto: InventoryItemDetailDto) = InventoryItemDetail(
        id = dto.id,
        name = dto.name,
        unit = dto.unit,
        currentStock = dto.current_stock,
        minStock = dto.min_stock,
        amountPerPieceBase = dto.amount_per_piece_base,
        pictogramPath = dto.pictogram_path?.let(baseUrlConfig::resolveApiPath).orEmpty(),
        pictogramThumbPath = dto.pictogram_thumb_path?.let(baseUrlConfig::resolveApiPath).orEmpty(),
        createdAt = dto.created_at.orEmpty(),
        updatedAt = dto.updated_at.orEmpty(),
        movements = dto.movements.map { movement ->
            InventoryMovementRecord(
                id = movement.id,
                documentNumber = movement.document_number,
                documentReference = movement.document_reference.orEmpty(),
                documentDate = movement.document_date,
                movementType = InventoryMovementType.fromWire(movement.movement_type),
                quantity = movement.quantity,
                quantityPieces = movement.quantity_pieces,
                note = movement.note.orEmpty(),
                createdAt = movement.created_at.orEmpty(),
            )
        },
    )
}
