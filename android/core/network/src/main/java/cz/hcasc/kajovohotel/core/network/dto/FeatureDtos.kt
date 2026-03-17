package cz.hcasc.kajovohotel.core.network.dto

data class MediaPhotoDto(val id: Int, val sort_order: Int, val mime_type: String, val size_bytes: Int, val file_path: String, val thumb_path: String, val created_at: String?)

data class BreakfastOrderDto(
    val id: Int,
    val service_date: String,
    val room_number: String,
    val guest_name: String,
    val guest_count: Int,
    val note: String? = null,
    val diet_no_gluten: Boolean = false,
    val diet_no_milk: Boolean = false,
    val diet_no_pork: Boolean = false,
    val status: String = "pending",
    val created_at: String? = null,
    val updated_at: String? = null,
)

data class BreakfastDailySummaryDto(val service_date: String, val total_orders: Int, val total_guests: Int, val status_counts: Map<String, Int>)
data class BreakfastOrderCreateDto(val service_date: String, val room_number: String, val guest_name: String, val guest_count: Int, val note: String? = null, val diet_no_gluten: Boolean = false, val diet_no_milk: Boolean = false, val diet_no_pork: Boolean = false, val status: String = "pending")
data class BreakfastOrderUpdateDto(val service_date: String? = null, val room_number: String? = null, val guest_name: String? = null, val guest_count: Int? = null, val note: String? = null, val diet_no_gluten: Boolean? = null, val diet_no_milk: Boolean? = null, val diet_no_pork: Boolean? = null, val status: String? = null)
data class BreakfastImportItemDto(val room: Int, val count: Int, val guest_name: String? = null, val diet_no_gluten: Boolean = false, val diet_no_milk: Boolean = false, val diet_no_pork: Boolean = false)
data class BreakfastImportResponseDto(val date: String, val status: String, val items: List<BreakfastImportItemDto>, val ok: Boolean = true, val saved: Boolean = false)

data class LostFoundItemDto(
    val id: Int,
    val category: String,
    val description: String,
    val location: String,
    val event_at: String,
    val item_type: String = "found",
    val status: String = "new",
    val room_number: String? = null,
    val claimant_name: String? = null,
    val claimant_contact: String? = null,
    val handover_note: String? = null,
    val claimed_at: String? = null,
    val returned_at: String? = null,
    val tags: List<String> = emptyList(),
    val photos: List<MediaPhotoDto> = emptyList(),
    val created_at: String? = null,
    val updated_at: String? = null,
)

data class LostFoundItemCreateDto(val description: String, val category: String, val location: String, val event_at: String, val item_type: String = "found", val status: String = "new", val room_number: String? = null, val claimant_name: String? = null, val claimant_contact: String? = null, val handover_note: String? = null, val claimed_at: String? = null, val returned_at: String? = null, val tags: List<String> = emptyList())
data class LostFoundItemUpdateDto(val description: String? = null, val category: String? = null, val location: String? = null, val event_at: String? = null, val item_type: String? = null, val status: String? = null, val room_number: String? = null, val claimant_name: String? = null, val claimant_contact: String? = null, val handover_note: String? = null, val claimed_at: String? = null, val returned_at: String? = null, val tags: List<String>? = null)

data class IssueDto(
    val id: Int,
    val title: String,
    val location: String,
    val description: String? = null,
    val room_number: String? = null,
    val assignee: String? = null,
    val status: String = "new",
    val priority: String = "medium",
    val photos: List<MediaPhotoDto> = emptyList(),
    val in_progress_at: String? = null,
    val resolved_at: String? = null,
    val closed_at: String? = null,
    val created_at: String? = null,
    val updated_at: String? = null,
)

data class IssueCreateDto(val title: String, val location: String, val description: String? = null, val room_number: String? = null, val assignee: String? = null, val status: String = "new", val priority: String = "medium")
data class IssueUpdateDto(val title: String? = null, val location: String? = null, val description: String? = null, val room_number: String? = null, val assignee: String? = null, val status: String? = null, val priority: String? = null)

data class InventoryItemDto(val id: Int, val name: String, val unit: String, val current_stock: Int, val min_stock: Int, val amount_per_piece_base: Int = 1, val pictogram_path: String? = null, val pictogram_thumb_path: String? = null, val created_at: String? = null, val updated_at: String? = null)
data class InventoryMovementCreateDto(val movement_type: String, val quantity: Int, val quantity_pieces: Int = 0, val document_date: String, val document_reference: String? = null, val note: String? = null)
data class InventoryMovementDto(val id: Int, val item_id: Int, val item_name: String? = null, val unit: String? = null, val card_id: Int? = null, val card_item_id: Int? = null, val card_number: String? = null, val movement_type: String, val document_number: String, val document_reference: String? = null, val document_date: String, val quantity: Int, val quantity_pieces: Int, val note: String? = null, val created_at: String? = null)
data class InventoryItemDetailDto(val id: Int, val name: String, val unit: String, val current_stock: Int, val min_stock: Int, val amount_per_piece_base: Int = 1, val pictogram_path: String? = null, val pictogram_thumb_path: String? = null, val movements: List<InventoryMovementDto> = emptyList(), val created_at: String? = null, val updated_at: String? = null)
