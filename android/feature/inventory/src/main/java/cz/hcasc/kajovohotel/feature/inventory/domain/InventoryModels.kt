package cz.hcasc.kajovohotel.feature.inventory.domain

import cz.hcasc.kajovohotel.core.model.InventoryMovementType

data class InventoryItemSummary(
    val id: Int,
    val name: String,
    val unit: String,
    val currentStock: Int,
    val minStock: Int,
    val pictogramThumbPath: String = "",
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
    val pictogramPath: String,
    val pictogramThumbPath: String,
    val createdAt: String,
    val updatedAt: String,
    val movements: List<InventoryMovementRecord>,
)

data class InventoryItemDraft(
    val name: String = "",
    val unit: String = "ks",
    val minStock: String = "0",
    val currentStock: String = "0",
    val amountPerPieceBase: String = "1",
) {
    fun isValid(): Boolean {
        return name.trim().isNotBlank()
            && unit in setOf("g", "l", "ks")
            && minStock.toIntOrNull()?.let { it >= 0 } == true
            && currentStock.toIntOrNull()?.let { it >= 0 } == true
            && amountPerPieceBase.toIntOrNull()?.let { it >= 1 } == true
    }
}

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

fun InventoryItemDraft.toCreateRequest() = cz.hcasc.kajovohotel.core.network.dto.InventoryItemCreateDto(
    name = name.trim(),
    unit = unit.trim().lowercase(),
    min_stock = minStock.toIntOrNull() ?: 0,
    current_stock = currentStock.toIntOrNull() ?: 0,
    amount_per_piece_base = amountPerPieceBase.toIntOrNull() ?: 1,
)

fun InventoryItemDraft.toUpdateRequest() = cz.hcasc.kajovohotel.core.network.dto.InventoryItemUpdateDto(
    name = name.trim(),
    unit = unit.trim().lowercase(),
    min_stock = minStock.toIntOrNull() ?: 0,
    current_stock = currentStock.toIntOrNull() ?: 0,
    amount_per_piece_base = amountPerPieceBase.toIntOrNull() ?: 1,
)

fun InventoryMovementDraft.toRequest() = cz.hcasc.kajovohotel.core.network.dto.InventoryMovementCreateDto(
    movement_type = movementType.wireValue,
    quantity = quantity.toIntOrNull() ?: 0,
    quantity_pieces = quantityPieces.toIntOrNull() ?: 0,
    document_date = documentDate.trim(),
    document_reference = documentReference.trim().ifBlank { null },
    note = note.trim().ifBlank { null },
)

fun InventoryItemDetail.toItemDraft() = InventoryItemDraft(
    name = name,
    unit = unit,
    minStock = minStock.toString(),
    currentStock = currentStock.toString(),
    amountPerPieceBase = amountPerPieceBase.toString(),
)
