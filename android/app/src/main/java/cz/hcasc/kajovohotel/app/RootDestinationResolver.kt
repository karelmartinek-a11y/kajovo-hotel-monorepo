package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.model.ActorType
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.BlockingUtilityState
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.SessionState

fun resolveRootRoute(sessionState: SessionState): String = when (sessionState) {
    SessionState.Checking -> PortalRoutes.Intro
    SessionState.Unauthenticated -> PortalRoutes.Login
    is SessionState.Failure -> when (sessionState.utilityState) {
        BlockingUtilityState.OFFLINE -> PortalRoutes.Offline
        BlockingUtilityState.MAINTENANCE -> PortalRoutes.Maintenance
        BlockingUtilityState.GLOBAL_BLOCKING_ERROR -> PortalRoutes.GlobalError
    }
    is SessionState.Authenticated -> resolveAuthenticatedRoute(sessionState.identity)
}

fun resolveAuthenticatedRoute(identity: AuthenticatedIdentity): String {
    if (identity.actorType == ActorType.ADMIN) {
        return PortalRoutes.AccessDenied
    }
    if (identity.requiresRoleSelection()) {
        return PortalRoutes.Roles
    }
    val activeRole = identity.resolvedActiveRole() ?: identity.assignedRoles().singleOrNull() ?: return PortalRoutes.Login
    return if (identity.canOpenDestination(activeRole.homeRoute())) {
        activeRole.homeRoute()
    } else {
        PortalDestinations.firstOrNull { destination -> destination.isAccessibleBy(identity) }?.route ?: PortalRoutes.Profile
    }
}

fun AuthenticatedIdentity.canOpenDestination(route: String): Boolean {
    val normalizedRoute = route.substringBefore('/')
    val destination = PortalDestinations.firstOrNull { it.route == normalizedRoute } ?: return normalizedRoute in setOf(
        PortalRoutes.Profile,
        PortalRoutes.ChangePassword,
        PortalRoutes.Offline,
        PortalRoutes.Maintenance,
        PortalRoutes.NotFound,
        PortalRoutes.AccessDenied,
        PortalRoutes.GlobalError,
    )
    return destination.isAccessibleBy(this)
}

fun PortalDestination.isAccessibleBy(identity: AuthenticatedIdentity): Boolean {
    val currentRole = identity.resolvedActiveRole() ?: return false
    return allowedRoles.contains(currentRole)
}

fun AuthenticatedIdentity.accessibleRoles(): List<PortalRole> {
    return assignedRoles().filter { role ->
        PortalDestinations.any { destination -> destination.allowedRoles.contains(role) }
    }
}
