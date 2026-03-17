package cz.hcasc.kajovohotel.feature.inventory.domain

import cz.hcasc.kajovohotel.core.model.InventoryMovementType

data class InventoryItemSummary(
    val id: Int,
    val name: String,
    val unit: String,
    val currentStock: Int,
    val minStock: Int,
)

data class InventoryMovementRecord(
    val id: Int,
    val documentNumber: String,
    val documentDate: String,
    val movementType: InventoryMovementType,
    val quantity: Int,
    val quantityPieces: Int,
    val note: String,
)

data class InventoryItemDetail(
    val id: Int,
    val name: String,
    val unit: String,
    val currentStock: Int,
    val minStock: Int,
    val amountPerPieceBase: Int,
    val movements: List<InventoryMovementRecord>,
)

data class InventoryMovementDraft(
    val movementType: InventoryMovementType = InventoryMovementType.OUT,
    val quantity: String = "",
    val quantityPieces: String = "0",
    val documentDate: String = java.time.LocalDate.now().toString(),
    val documentReference: String = "",
    val note: String = "",
) {
    fun isValid(): Boolean = quantity.toIntOrNull()?.let { it > 0 } == true && documentDate.isNotBlank()
}

fun InventoryMovementDraft.toRequest() = cz.hcasc.kajovohotel.core.network.dto.InventoryMovementCreateDto(
    movement_type = movementType.wireValue,
    quantity = quantity.toIntOrNull() ?: 0,
    quantity_pieces = quantityPieces.toIntOrNull() ?: 0,
    document_date = documentDate.trim(),
    document_reference = documentReference.trim().ifBlank { null },
    note = note.trim().ifBlank { null },
)
