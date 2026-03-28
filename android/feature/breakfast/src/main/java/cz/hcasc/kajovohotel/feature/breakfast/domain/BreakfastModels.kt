package cz.hcasc.kajovohotel.feature.breakfast.domain

import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.core.model.PortalRole

enum class BreakfastDietKey {
    NO_GLUTEN,
    NO_MILK,
    NO_PORK,
}

data class BreakfastOrder(
    val id: Int,
    val serviceDate: String,
    val roomNumber: String,
    val guestName: String,
    val guestCount: Int,
    val note: String,
    val noGluten: Boolean,
    val noMilk: Boolean,
    val noPork: Boolean,
    val status: BreakfastStatus,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class BreakfastSummary(
    val serviceDate: String,
    val totalOrders: Int,
    val totalGuests: Int,
    val statusCounts: Map<String, Int>,
)

data class BreakfastServiceStats(
    val totalBreakfasts: Int,
    val servedBreakfasts: Int,
    val remainingBreakfasts: Int,
    val totalRooms: Int,
    val servedRooms: Int,
    val remainingRooms: Int,
)

data class BreakfastImportPreview(
    val sourceFileName: String,
    val serviceDate: String,
    val items: List<BreakfastImportItem>,
    val saved: Boolean,
)

data class BreakfastImportItem(
    val room: Int,
    val count: Int,
    val guestName: String,
    val noGluten: Boolean,
    val noMilk: Boolean,
    val noPork: Boolean,
)

data class BreakfastDraft(
    val serviceDate: String = "",
    val roomNumber: String = "",
    val guestName: String = "",
    val guestCount: String = "1",
    val note: String = "",
    val noGluten: Boolean = false,
    val noMilk: Boolean = false,
    val noPork: Boolean = false,
    val status: BreakfastStatus = BreakfastStatus.PENDING,
)

data class BreakfastOrderDraft(
    val status: BreakfastStatus? = null,
    val noGluten: Boolean? = null,
    val noMilk: Boolean? = null,
    val noPork: Boolean? = null,
) {
    fun isEmpty(): Boolean = status == null && noGluten == null && noMilk == null && noPork == null
}

fun BreakfastDraft.isValidForSubmit(): Boolean {
    val count = guestCount.toIntOrNull()
    return serviceDate.isNotBlank() && roomNumber.isNotBlank() && guestName.isNotBlank() && count != null && count > 0
}

fun BreakfastDraft.toCreateRequest() = cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderCreateDto(
    service_date = serviceDate.trim(),
    room_number = roomNumber.trim(),
    guest_name = guestName.trim(),
    guest_count = guestCount.toIntOrNull() ?: 1,
    note = note.trim().ifBlank { null },
    diet_no_gluten = noGluten,
    diet_no_milk = noMilk,
    diet_no_pork = noPork,
    status = status.wireValue,
)

fun BreakfastDraft.toUpdateRequest() = cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderUpdateDto(
    service_date = serviceDate.trim(),
    room_number = roomNumber.trim(),
    guest_name = guestName.trim(),
    guest_count = guestCount.toIntOrNull() ?: 1,
    note = note.trim().ifBlank { null },
    diet_no_gluten = noGluten,
    diet_no_milk = noMilk,
    diet_no_pork = noPork,
    status = status.wireValue,
)

fun BreakfastOrder.toDraft() = BreakfastDraft(
    serviceDate = serviceDate,
    roomNumber = roomNumber,
    guestName = guestName,
    guestCount = guestCount.toString(),
    note = note,
    noGluten = noGluten,
    noMilk = noMilk,
    noPork = noPork,
    status = status,
)

fun BreakfastImportItem.toggleDiet(key: BreakfastDietKey): BreakfastImportItem = when (key) {
    BreakfastDietKey.NO_GLUTEN -> copy(noGluten = !noGluten)
    BreakfastDietKey.NO_MILK -> copy(noMilk = !noMilk)
    BreakfastDietKey.NO_PORK -> copy(noPork = !noPork)
}

fun BreakfastOrder.applyDraft(draft: BreakfastOrderDraft?) = copy(
    status = draft?.status ?: status,
    noGluten = draft?.noGluten ?: noGluten,
    noMilk = draft?.noMilk ?: noMilk,
    noPork = draft?.noPork ?: noPork,
)

fun BreakfastOrderDraft.isMeaningfulFor(order: BreakfastOrder): Boolean = !order.applyDraft(this).let { effective ->
    effective.status == order.status &&
        effective.noGluten == order.noGluten &&
        effective.noMilk == order.noMilk &&
        effective.noPork == order.noPork
}

fun BreakfastOrder.toQueuedDraftUpdate(draft: BreakfastOrderDraft) = cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderUpdateDto(
    service_date = serviceDate,
    room_number = roomNumber,
    guest_name = guestName,
    guest_count = guestCount,
    note = note.ifBlank { null },
    diet_no_gluten = draft.noGluten ?: noGluten,
    diet_no_milk = draft.noMilk ?: noMilk,
    diet_no_pork = draft.noPork ?: noPork,
    status = (draft.status ?: status).wireValue,
)

fun BreakfastOrder.matchesSearch(query: String): Boolean {
    val term = query.trim().lowercase()
    if (term.isBlank()) return true
    return roomNumber.lowercase().contains(term) || guestName.lowercase().contains(term)
}

fun PortalRole.breakfastScreenTitle(): String = when (this) {
    PortalRole.RECEPTION -> "Snídaně / recepce"
    PortalRole.BREAKFAST -> "Snídaňový servis"
    else -> "Snídaně"
}

fun List<BreakfastOrder>.sortedForService(): List<BreakfastOrder> {
    return filter { it.guestCount > 0 }
        .sortedWith(compareBy<BreakfastOrder> { roomSortGroup(it.roomNumber) }.thenBy { roomSortNumber(it.roomNumber) }.thenBy { it.roomNumber })
}

fun List<BreakfastOrder>.serviceStats(summary: BreakfastSummary?): BreakfastServiceStats {
    val totalBreakfasts = summary?.totalGuests ?: sumOf { it.guestCount }
    val servedBreakfasts = filter { it.status == BreakfastStatus.SERVED }.sumOf { it.guestCount }
    val totalRooms = size
    val servedRooms = count { it.status == BreakfastStatus.SERVED }
    return BreakfastServiceStats(
        totalBreakfasts = totalBreakfasts,
        servedBreakfasts = servedBreakfasts,
        remainingBreakfasts = (totalBreakfasts - servedBreakfasts).coerceAtLeast(0),
        totalRooms = totalRooms,
        servedRooms = servedRooms,
        remainingRooms = (totalRooms - servedRooms).coerceAtLeast(0),
    )
}

private fun roomSortGroup(roomNumber: String): Int = if (roomSortNumber(roomNumber) != Int.MAX_VALUE) 0 else 1

private fun roomSortNumber(roomNumber: String): Int {
    return Regex("""\d+""").find(roomNumber)?.value?.toIntOrNull() ?: Int.MAX_VALUE
}
