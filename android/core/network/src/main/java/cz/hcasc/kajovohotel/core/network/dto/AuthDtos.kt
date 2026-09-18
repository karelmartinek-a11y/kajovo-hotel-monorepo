package cz.hcasc.kajovohotel.core.network.dto

data class AuthIdentityDto(
    val email: String,
    val role: String,
    val roles: List<String> = emptyList(),
    val active_role: String? = null,
    val permissions: List<String>,
    val actor_type: String,
)

data class AndroidReleaseDto(
    val version_code: Int,
    val version: String,
    val download_url: String,
    val sha256: String,
    val title: String,
    val message: String,
    val required: Boolean = false,
)

data class PortalLoginRequest(
    val email: String,
    val password: String,
    val remember_me: Boolean = false,
)
data class SelectRoleRequest(val role: String)

data class AuthProfileDto(
    val email: String,
    val first_name: String,
    val last_name: String,
    val phone: String? = null,
    val note: String? = null,
    val roles: List<String> = emptyList(),
    val actor_type: String,
)

data class AuthProfileUpdateRequest(
    val first_name: String,
    val last_name: String,
    val phone: String? = null,
    val note: String? = null,
)

data class PortalPasswordChangeRequest(val old_password: String, val new_password: String)
data class PortalPasswordResetRequest(val token: String, val new_password: String)
