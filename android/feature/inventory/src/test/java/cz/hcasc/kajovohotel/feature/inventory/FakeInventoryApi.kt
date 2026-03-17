package cz.hcasc.kajovohotel.feature.inventory

import cz.hcasc.kajovohotel.core.network.api.InventoryApi
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDetailDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryItemDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryMovementCreateDto
import cz.hcasc.kajovohotel.core.network.dto.InventoryMovementDto

internal class FakeInventoryApi : InventoryApi {
    override suspend fun list(lowStock: Boolean): List<InventoryItemDto> = listOf(
        InventoryItemDto(id = 9, name = "Káva", unit = "kg", current_stock = 8, min_stock = 2),
    )

    override suspend fun addMovement(itemId: Int, request: InventoryMovementCreateDto): InventoryItemDetailDto = InventoryItemDetailDto(
        id = itemId,
        name = "Káva",
        unit = "kg",
        current_stock = 12,
        min_stock = 2,
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
}
