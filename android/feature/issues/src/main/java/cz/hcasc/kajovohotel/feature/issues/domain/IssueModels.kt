package cz.hcasc.kajovohotel.feature.issues.domain

import cz.hcasc.kajovohotel.core.model.IssuePriority
import cz.hcasc.kajovohotel.core.model.IssueStatus
import cz.hcasc.kajovohotel.core.model.MediaPhoto

data class MaintenanceIssue(
    val id: Int,
    val title: String,
    val location: String,
    val description: String,
    val roomNumber: String,
    val assignee: String,
    val status: IssueStatus,
    val priority: IssuePriority,
    val photos: List<MediaPhoto>,
)

data class IssueFilters(
    val status: IssueStatus? = null,
    val priority: IssuePriority? = null,
    val roomNumber: String = "",
)

data class IssueDraft(
    val title: String = "",
    val location: String = "",
    val description: String = "",
    val roomNumber: String = "",
    val priority: IssuePriority = IssuePriority.MEDIUM,
) {
    fun isValidForSubmit(): Boolean = title.isNotBlank() && location.isNotBlank()
}

fun MaintenanceIssue.toDraft() = IssueDraft(
    title = title,
    location = location,
    description = description,
    roomNumber = roomNumber,
    priority = priority,
)
