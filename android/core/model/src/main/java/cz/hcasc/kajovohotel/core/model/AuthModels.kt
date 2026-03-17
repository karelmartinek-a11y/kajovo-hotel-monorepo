package cz.hcasc.kajovohotel.core.model

enum class ActorType {
    PORTAL,
    ADMIN;

    companion object {
        fun fromWire(raw: String?): ActorType = if (raw.equals("admin", ignoreCase = true)) ADMIN else PORTAL
    }
}

enum class BlockingUtilityState {
    OFFLINE,
    MAINTENANCE,
    GLOBAL_BLOCKING_ERROR,
}

data class AuthenticatedIdentity(
    val email: String,
    val actorType: ActorType,
    val roleLabel: String,
    val roles: List<PortalRole>,
    val activeRole: PortalRole?,
    val permissions: Set<String>,
) {
    fun canAccess(module: HotelModule): Boolean {
        return permissions.contains("${module.permissionKey}:read") || permissions.contains("${module.permissionKey}:write")
    }

    fun requiresRoleSelection(): Boolean = actorType == ActorType.PORTAL && activeRole == null && roles.size > 1

    fun displayRole(): String = activeRole?.displayName ?: "Vyber roli"
}

data class AuthProfile(
    val email: String,
    val firstName: String,
    val lastName: String,
    val phone: String?,
    val note: String?,
    val roles: List<PortalRole>,
    val actorType: ActorType,
) {
    val fullName: String get() = listOf(firstName, lastName).joinToString(" ").trim()
}

enum class HotelModule(val permissionKey: String) {
    BREAKFAST("breakfast"),
    LOST_FOUND("lost_found"),
    ISSUES("issues"),
    INVENTORY("inventory"),
    HOUSEKEEPING("housekeeping"),
}

sealed interface SessionState {
    data object Checking : SessionState
    data object Unauthenticated : SessionState
    data class Authenticated(val identity: AuthenticatedIdentity) : SessionState
    data class Failure(
        val message: String,
        val utilityState: BlockingUtilityState = BlockingUtilityState.GLOBAL_BLOCKING_ERROR,
    ) : SessionState
}
