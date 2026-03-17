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
