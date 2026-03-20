package cz.hcasc.kajovohotel.feature.reports.domain

import cz.hcasc.kajovohotel.core.model.MediaPhoto

enum class ReportStatus(val wireValue: String, val label: String) {
    OPEN("open", "Otevřené"),
    IN_PROGRESS("in_progress", "V řešení"),
    CLOSED("closed", "Uzavřené");

    companion object {
        fun fromWire(raw: String?): ReportStatus = entries.firstOrNull { it.wireValue == raw } ?: OPEN
    }
}

data class HotelReport(
    val id: Int,
    val title: String,
    val description: String,
    val status: ReportStatus,
    val createdAt: String,
    val updatedAt: String,
    val photos: List<MediaPhoto>,
)

data class ReportFilters(
    val status: ReportStatus? = null,
)

data class ReportDraft(
    val title: String = "",
    val description: String = "",
    val status: ReportStatus = ReportStatus.OPEN,
) {
    fun isValid(): Boolean = title.trim().length >= 3
}

fun HotelReport.toDraft() = ReportDraft(
    title = title,
    description = description,
    status = status,
)
