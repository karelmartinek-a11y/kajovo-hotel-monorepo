package cz.hcasc.kajovohotel.core.model

enum class BreakfastStatus(val wireValue: String, val label: String) {
    PENDING("pending", "Čeká"),
    PREPARING("preparing", "Připravuje se"),
    SERVED("served", "Vydáno"),
    CANCELLED("cancelled", "Zrušeno");

    companion object {
        fun fromWire(raw: String?): BreakfastStatus = entries.firstOrNull { it.wireValue == raw } ?: PENDING
    }
}

enum class LostFoundStatus(val wireValue: String, val label: String) {
    NEW("new", "Nové"),
    STORED("stored", "Uloženo"),
    DISPOSED("disposed", "Vyřazeno"),
    CLAIMED("claimed", "Převzato"),
    RETURNED("returned", "Vráceno");

    companion object {
        fun fromWire(raw: String?): LostFoundStatus = entries.firstOrNull { it.wireValue == raw } ?: NEW
    }
}

enum class LostFoundItemType(val wireValue: String, val label: String) {
    LOST("lost", "Ztraceno"),
    FOUND("found", "Nalezeno");

    companion object {
        fun fromWire(raw: String?): LostFoundItemType = entries.firstOrNull { it.wireValue == raw } ?: FOUND
    }
}

enum class IssueStatus(val wireValue: String, val label: String) {
    NEW("new", "Nová"),
    IN_PROGRESS("in_progress", "Řeší se"),
    RESOLVED("resolved", "Vyřešeno"),
    CLOSED("closed", "Uzavřeno");

    companion object {
        fun fromWire(raw: String?): IssueStatus = entries.firstOrNull { it.wireValue == raw } ?: NEW
    }
}

enum class IssuePriority(val wireValue: String, val label: String) {
    LOW("low", "Nízká"),
    MEDIUM("medium", "Střední"),
    HIGH("high", "Vysoká"),
    CRITICAL("critical", "Kritická");

    companion object {
        fun fromWire(raw: String?): IssuePriority = entries.firstOrNull { it.wireValue == raw } ?: MEDIUM
    }
}

enum class InventoryMovementType(val wireValue: String, val label: String) {
    IN("in", "Příjem"),
    OUT("out", "Výdej"),
    ADJUST("adjust", "Odpis / úprava");

    companion object {
        fun fromWire(raw: String?): InventoryMovementType = entries.firstOrNull { it.wireValue == raw } ?: OUT
    }
}

data class MediaPhoto(
    val id: Int,
    val thumbUrl: String,
    val fullUrl: String,
    val mimeType: String,
    val sizeBytes: Int,
)
