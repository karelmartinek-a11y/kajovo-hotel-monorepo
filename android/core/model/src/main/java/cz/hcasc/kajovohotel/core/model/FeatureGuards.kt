package cz.hcasc.kajovohotel.core.model

fun canManageBreakfast(role: PortalRole?, permissions: Set<String>): Boolean = role == PortalRole.RECEPTION && permissions.contains("breakfast:write")
fun canServeBreakfast(role: PortalRole?, permissions: Set<String>): Boolean = role in setOf(PortalRole.RECEPTION, PortalRole.BREAKFAST) && permissions.contains("breakfast:write")
fun canCreateIssueFromHousekeeping(role: PortalRole?, permissions: Set<String>): Boolean = role == PortalRole.HOUSEKEEPING && permissions.contains("issues:write")
fun canCreateLostFoundFromHousekeeping(role: PortalRole?, permissions: Set<String>): Boolean = role == PortalRole.HOUSEKEEPING && permissions.contains("lost_found:write")
fun canSubmitInventoryMovement(role: PortalRole?, permissions: Set<String>): Boolean = role == PortalRole.INVENTORY && permissions.contains("inventory:write")
fun allowedMaintenanceTransitions(current: IssueStatus): Set<IssueStatus> = when (current) {
    IssueStatus.NEW -> setOf(IssueStatus.IN_PROGRESS)
    IssueStatus.IN_PROGRESS -> setOf(IssueStatus.RESOLVED)
    IssueStatus.RESOLVED, IssueStatus.CLOSED -> emptySet()
}
