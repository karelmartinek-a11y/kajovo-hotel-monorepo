package cz.hcasc.kajovohotel.feature.lostfound.domain

import cz.hcasc.kajovohotel.core.model.LostFoundItemType
import cz.hcasc.kajovohotel.core.model.LostFoundStatus
import cz.hcasc.kajovohotel.core.model.MediaPhoto
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

data class LostFoundRecord(
    val id: Int,
    val category: String,
    val description: String,
    val location: String,
    val eventAt: String,
    val itemType: LostFoundItemType,
    val status: LostFoundStatus,
    val roomNumber: String,
    val claimantName: String,
    val claimantContact: String,
    val handoverNote: String,
    val tags: List<String>,
    val photos: List<MediaPhoto>,
)

data class LostFoundFilters(
    val itemType: LostFoundItemType? = null,
    val status: LostFoundStatus? = null,
    val category: String = "",
)

data class LostFoundDraft(
    val category: String = "",
    val description: String = "",
    val location: String = "",
    val eventAt: String = java.time.LocalDate.now().toString(),
    val itemType: LostFoundItemType = LostFoundItemType.FOUND,
    val status: LostFoundStatus = LostFoundStatus.NEW,
    val roomNumber: String = "",
    val claimantName: String = "",
    val claimantContact: String = "",
    val handoverNote: String = "",
    val tags: String = "",
)

fun LostFoundDraft.isValidForSubmit(): Boolean = category.isNotBlank() && description.isNotBlank() && location.isNotBlank() && eventAt.isNotBlank()

fun LostFoundDraft.toCreateRequest() = cz.hcasc.kajovohotel.core.network.dto.LostFoundItemCreateDto(
    description = description.trim(),
    category = category.trim(),
    location = location.trim(),
    event_at = eventAt.trim(),
    item_type = itemType.wireValue,
    status = status.wireValue,
    room_number = roomNumber.trim().ifBlank { null },
    claimant_name = claimantName.trim().ifBlank { null },
    claimant_contact = claimantContact.trim().ifBlank { null },
    handover_note = handoverNote.trim().ifBlank { null },
    tags = tags.split(',').map { it.trim() }.filter { it.isNotBlank() },
)

fun LostFoundDraft.toUpdateRequest() = cz.hcasc.kajovohotel.core.network.dto.LostFoundItemUpdateDto(
    description = description.trim(),
    category = category.trim(),
    location = location.trim(),
    event_at = eventAt.trim(),
    item_type = itemType.wireValue,
    status = status.wireValue,
    room_number = roomNumber.trim().ifBlank { null },
    claimant_name = claimantName.trim().ifBlank { null },
    claimant_contact = claimantContact.trim().ifBlank { null },
    handover_note = handoverNote.trim().ifBlank { null },
    tags = tags.split(',').map { it.trim() }.filter { it.isNotBlank() },
)

fun LostFoundRecord.toDraft() = LostFoundDraft(
    category = category,
    description = description,
    location = location,
    eventAt = eventAt,
    itemType = itemType,
    status = status,
    roomNumber = roomNumber,
    claimantName = claimantName,
    claimantContact = claimantContact,
    handoverNote = handoverNote,
    tags = tags.joinToString(", "),
)

val lostFoundKnownTags: List<Pair<String, String>> = listOf(
    "kontaktova" to "Kontaktová",
    "nezastizen" to "Nezastižen",
    "vyzvedne" to "Vyzvedne",
    "odesleme" to "Odešleme",
)

fun LostFoundDraft.selectedTags(): Set<String> {
    return tags.split(',')
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()
}

fun LostFoundDraft.toggleTag(tag: String): LostFoundDraft {
    val updated = selectedTags().toMutableSet()
    if (tag in updated) {
        updated.remove(tag)
    } else {
        updated.add(tag)
    }
    val ordered = lostFoundKnownTags.map { it.first }.filter(updated::contains) + updated.filterNot { current ->
        lostFoundKnownTags.any { it.first == current }
    }.sorted()
    return copy(tags = ordered.joinToString(", "))
}

private val lostFoundInputFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
private val lostFoundDisplayFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("d. M. yyyy HH:mm")

fun defaultLostFoundEventAt(): String = LocalDateTime.now().format(lostFoundInputFormatter)

fun LostFoundDraft.eventAtForPicker(): LocalDateTime {
    return runCatching { LocalDateTime.parse(eventAt.take(16), lostFoundInputFormatter) }
        .getOrElse { LocalDateTime.now() }
}

fun formatLostFoundEventAtForUi(raw: String): String {
    return runCatching { LocalDateTime.parse(raw.take(16), lostFoundInputFormatter).format(lostFoundDisplayFormatter) }
        .getOrElse { raw }
}
