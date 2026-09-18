package cz.hcasc.kajovohotel.feature.inventory

import cz.hcasc.kajovohotel.core.network.api.InventoryApi
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemCreateDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDetailDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemUpdateDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryMovementCreateDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryMovementDto
import okhttp3.MultipartBody

internal class FakeInventoryApi : InventoryApi {
    override suspend fun list(lowStock: Boolean): List<InventoryItemDto> = listOf(
        InventoryItemDto(id = 9, name = "Káva", unit = "ks", current_stock = 8, min_stock = 2, amount_per_piece_base = 1),
    )

    override suspend fun detail(itemId: Int): InventoryItemDetailDto = InventoryItemDetailDto(
        id = itemId,
        name = "Káva",
        unit = "ks",
        current_stock = 8,
        min_stock = 2,
        amount_per_piece_base = 1,
        movements = listOf(
            InventoryMovementDto(
                id = 41,
                item_id = itemId,
                movement_type = "out",
                document_number = "DOC-41",
                document_date = "2026-03-16",
                quantity = 2,
                quantity_pieces = 0,
            ),
        ),
    )

    override suspend fun create(request: InventoryItemCreateDto): InventoryItemDto = InventoryItemDto(
        id = 10,
        name = request.name,
        unit = request.unit,
        current_stock = request.current_stock,
        min_stock = request.min_stock,
        amount_per_piece_base = request.amount_per_piece_base,
    )

    override suspend fun update(itemId: Int, request: InventoryItemUpdateDto): InventoryItemDto = InventoryItemDto(
        id = itemId,
        name = request.name ?: "Káva",
        unit = request.unit ?: "ks",
        current_stock = request.current_stock ?: 8,
        min_stock = request.min_stock ?: 2,
        amount_per_piece_base = request.amount_per_piece_base ?: 1,
    )

    override suspend fun addMovement(itemId: Int, request: InventoryMovementCreateDto): InventoryItemDetailDto = InventoryItemDetailDto(
        id = itemId,
        name = "Káva",
        unit = "ks",
        current_stock = 12,
        min_stock = 2,
        amount_per_piece_base = 1,
        movements = listOf(
            InventoryMovementDto(
                id = 42,
                item_id = itemId,
                movement_type = request.movement_type,
                document_number = "DOC-42",
                document_date = request.document_date,
                quantity = request.quantity,
                quantity_pieces = request.quantity_pieces,
            ),
        ),
    )

    override suspend fun uploadPictogram(itemId: Int, file: MultipartBody.Part): InventoryItemDto = InventoryItemDto(
        id = itemId,
        name = "Káva",
        unit = "ks",
        current_stock = 8,
        min_stock = 2,
        amount_per_piece_base = 1,
        pictogram_path = "inventory/original.jpg",
        pictogram_thumb_path = "inventory/thumb.jpg",
    )
}
