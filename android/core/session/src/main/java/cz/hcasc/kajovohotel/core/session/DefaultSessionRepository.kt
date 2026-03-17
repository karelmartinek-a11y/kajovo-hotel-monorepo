package cz.hcasc.kajovohotel.core.session

import cz.hcasc.kajovohotel.core.common.AppLogger
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.database.ModuleSnapshotDao
import cz.hcasc.kajovohotel.core.model.ActorType
import cz.hcasc.kajovohotel.core.model.AuthProfile
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.BlockingUtilityState
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.core.network.AuthNetworkEvent
import cz.hcasc.kajovohotel.core.network.api.AuthApi
import cz.hcasc.kajovohotel.core.network.dto.AuthIdentityDto
import cz.hcasc.kajovohotel.core.network.dto.AuthProfileDto
import cz.hcasc.kajovohotel.core.network.dto.AuthProfileUpdateRequest
import cz.hcasc.kajovohotel.core.network.dto.PortalLoginRequest
import cz.hcasc.kajovohotel.core.network.dto.PortalPasswordChangeRequest
import cz.hcasc.kajovohotel.core.network.dto.SelectRoleRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class DefaultSessionRepository(
    private val authApi: AuthApi,
    private val cookieStore: SessionCookieStore,
    private val metadataStore: SessionMetadataStore,
    private val moduleSnapshotDao: ModuleSnapshotDao,
    private val logger: AppLogger,
) : SessionRepository {
    private val mutableSessionState = MutableStateFlow<SessionState>(SessionState.Checking)
    override val sessionState: StateFlow<SessionState> = mutableSessionState

    override suspend fun restoreSession() {
        mutableSessionState.value = SessionState.Checking
        runCatching { authApi.me() }
            .onSuccess { dto ->
                applyAuthenticatedIdentity(dto, dto.active_role)
            }
            .onFailure { throwable ->
                val resolution = SessionErrorMapper.resolve(
                    throwable = throwable,
                    fallbackMessage = "Nepodařilo se obnovit session.",
                )
                if (!restoreRoleSelectionFromSnapshot(resolution)) {
                    applyResolution(resolution)
                }
            }
    }

    override suspend fun signIn(email: String, password: String, rememberMe: Boolean) {
        mutableSessionState.value = SessionState.Checking
        runCatching {
            authApi.login(
                PortalLoginRequest(
                    email = email,
                    password = password,
                    remember_me = rememberMe,
                ),
            )
        }
            .onSuccess { loginDto ->
                metadataStore.saveIdentitySnapshot(loginDto.toSnapshot())
                runCatching { authApi.me() }
                    .onSuccess { dto ->
                        applyAuthenticatedIdentity(dto, dto.active_role)
                    }
                    .onFailure { throwable ->
                        val resolution = SessionErrorMapper.resolve(
                            throwable = throwable,
                            fallbackMessage = "Přihlášení se nepodařilo.",
                        )
                        if (!applyRoleSelectionFromIdentity(loginDto, resolution)) {
                            applyResolution(resolution)
                        }
                    }
            }
            .onFailure { throwable ->
                applyResolution(
                    SessionErrorMapper.resolve(
                        throwable = throwable,
                        fallbackMessage = "Přihlášení se nepodařilo.",
                    ),
                )
            }
    }

    override suspend fun selectRole(role: PortalRole) {
        runCatching {
            authApi.selectRole(SelectRoleRequest(role = role.wireValue))
            authApi.me()
        }.onSuccess { dto ->
                applyAuthenticatedIdentity(dto, dto.active_role)
            }
            .onFailure { throwable ->
                applyResolution(
                    SessionErrorMapper.resolve(
                        throwable = throwable,
                        fallbackMessage = "Výběr role se nepodařil.",
                    ),
                )
            }
    }

    override suspend fun logout() {
        runCatching { authApi.logout() }
            .onFailure { logger.error("Logout request failed", it) }
        clearLocalSession()
        mutableSessionState.value = SessionState.Unauthenticated
    }

    override suspend fun handleNetworkEvent(event: AuthNetworkEvent) {
        when (event) {
            is AuthNetworkEvent.Unauthorized -> {
                clearLocalSession()
                mutableSessionState.value = SessionState.Unauthenticated
            }
            is AuthNetworkEvent.RoleSelectionRequired -> {
                val current = mutableSessionState.value as? SessionState.Authenticated
                if (current != null) {
                    val updatedIdentity = current.identity.copy(activeRole = null)
                    metadataStore.saveActiveRole(null)
                    mutableSessionState.value = SessionState.Authenticated(updatedIdentity)
                } else if (!restoreRoleSelectionFromSnapshot(SessionErrorResolution(message = event.message ?: "Vyberte aktivní roli pro pokračování.", requireRoleSelection = true))) {
                    mutableSessionState.value = SessionState.Failure(
                        message = event.message ?: "Vyberte aktivní roli pro pokračování.",
                        utilityState = BlockingUtilityState.GLOBAL_BLOCKING_ERROR,
                    )
                }
            }
            is AuthNetworkEvent.Maintenance -> {
                mutableSessionState.value = SessionState.Failure(
                    message = event.message ?: "Server je dočasně v maintenance režimu.",
                    utilityState = BlockingUtilityState.MAINTENANCE,
                )
            }
            is AuthNetworkEvent.Offline -> {
                mutableSessionState.value = SessionState.Failure(
                    message = event.message ?: "Síť není dostupná.",
                    utilityState = BlockingUtilityState.OFFLINE,
                )
            }
            is AuthNetworkEvent.AccessDenied -> {
                logger.info(event.message ?: "Server odmítl přístup k akci.")
            }
        }
    }

    override suspend fun loadProfile(): AppResult<AuthProfile> {
        return runCatching { authApi.profile().toProfile() }
            .fold(
                onSuccess = { AppResult.Success(it) },
                onFailure = { throwable ->
                    val resolution = SessionErrorMapper.resolve(throwable, "Nepodařilo se načíst profil.")
                    if (!restoreRoleSelectionFromSnapshot(resolution)) {
                        applyResolution(resolution)
                    }
                    AppResult.Error(resolution.message, throwable)
                },
            )
    }

    override suspend fun updateProfile(firstName: String, lastName: String, phone: String?, note: String?): AppResult<AuthProfile> {
        return runCatching {
            authApi.updateProfile(
                AuthProfileUpdateRequest(
                    first_name = firstName,
                    last_name = lastName,
                    phone = phone,
                    note = note,
                ),
            ).toProfile()
        }.fold(
            onSuccess = { AppResult.Success(it) },
            onFailure = { throwable ->
                val resolution = SessionErrorMapper.resolve(throwable, "Nepodařilo se uložit profil.")
                if (!restoreRoleSelectionFromSnapshot(resolution)) {
                    applyResolution(resolution)
                }
                AppResult.Error(resolution.message, throwable)
            },
        )
    }

    override suspend fun changePassword(oldPassword: String, newPassword: String): AppResult<Unit> {
        return runCatching {
            authApi.changePassword(
                PortalPasswordChangeRequest(
                    old_password = oldPassword,
                    new_password = newPassword,
                ),
            )
            clearLocalSession()
            mutableSessionState.value = SessionState.Unauthenticated
            Unit
        }.fold(
            onSuccess = { AppResult.Success(Unit) },
            onFailure = { throwable ->
                val resolution = SessionErrorMapper.resolve(throwable, "Změna hesla se nepodařila.")
                if (!restoreRoleSelectionFromSnapshot(resolution)) {
                    applyResolution(resolution)
                }
                AppResult.Error(resolution.message, throwable)
            },
        )
    }

    private suspend fun applyResolution(resolution: SessionErrorResolution) {
        when {
            resolution.clearLocalSession -> {
                clearLocalSession()
                mutableSessionState.value = SessionState.Unauthenticated
            }
            resolution.requireRoleSelection -> {
                if (!restoreRoleSelectionFromSnapshot(resolution)) {
                    mutableSessionState.value = SessionState.Failure(
                        message = resolution.message,
                        utilityState = BlockingUtilityState.GLOBAL_BLOCKING_ERROR,
                    )
                }
            }
            resolution.utilityState != null -> {
                mutableSessionState.value = SessionState.Failure(
                    message = resolution.message,
                    utilityState = resolution.utilityState,
                )
            }
            else -> {
                mutableSessionState.value = SessionState.Failure(
                    message = resolution.message,
                    utilityState = BlockingUtilityState.GLOBAL_BLOCKING_ERROR,
                )
            }
        }
        logger.error("Session repository resolution applied: ${resolution.message}")
    }

    private suspend fun restoreRoleSelectionFromSnapshot(resolution: SessionErrorResolution): Boolean {
        if (!resolution.requireRoleSelection) return false
        val snapshot = metadataStore.loadIdentitySnapshot() ?: return false
        mutableSessionState.value = SessionState.Authenticated(snapshot.toIdentity())
        metadataStore.saveActiveRole(null)
        return true
    }

    private suspend fun applyRoleSelectionFromIdentity(loginDto: AuthIdentityDto, resolution: SessionErrorResolution): Boolean {
        if (!resolution.requireRoleSelection) return false
        mutableSessionState.value = SessionState.Authenticated(loginDto.toAuthenticatedIdentity(activeRoleOverride = null))
        metadataStore.saveLastLogin(loginDto.email)
        metadataStore.saveActiveRole(null)
        return true
    }

    private suspend fun applyAuthenticatedIdentity(dto: AuthIdentityDto, activeRoleOverride: String?) {
        mutableSessionState.value = SessionState.Authenticated(dto.toAuthenticatedIdentity(activeRoleOverride))
        metadataStore.saveLastLogin(dto.email)
        metadataStore.saveActiveRole(activeRoleOverride)
        metadataStore.saveIdentitySnapshot(dto.toSnapshot())
    }

    private suspend fun clearLocalSession() {
        cookieStore.clearAll()
        metadataStore.clear()
        moduleSnapshotDao.clearAll()
    }

    private fun AuthIdentityDto.toAuthenticatedIdentity(activeRoleOverride: String?): AuthenticatedIdentity {
        val mappedRoles = roles.mapNotNull(PortalRole.Companion::fromWire).distinct()
        val primaryRole = PortalRole.fromWire(role)
        val allRoles = when {
            mappedRoles.isNotEmpty() -> mappedRoles
            primaryRole != null -> listOf(primaryRole)
            else -> emptyList()
        }
        return AuthenticatedIdentity(
            email = email,
            actorType = ActorType.fromWire(actor_type),
            roleLabel = role,
            roles = allRoles,
            activeRole = PortalRole.fromWire(activeRoleOverride) ?: allRoles.singleOrNull(),
            permissions = permissions.toSet(),
        )
    }

    private fun AuthIdentityDto.toSnapshot(): SessionIdentitySnapshot = SessionIdentitySnapshot(
        email = email,
        actorType = actor_type,
        roles = roles.ifEmpty { listOf(role) },
        permissions = permissions.toSet(),
    )

    private fun SessionIdentitySnapshot.toIdentity(): AuthenticatedIdentity = AuthenticatedIdentity(
        email = email,
        actorType = ActorType.fromWire(actorType),
        roleLabel = roles.firstOrNull().orEmpty(),
        roles = roles.mapNotNull(PortalRole.Companion::fromWire).distinct(),
        activeRole = null,
        permissions = permissions,
    )

    private fun AuthProfileDto.toProfile(): AuthProfile {
        return AuthProfile(
            email = email,
            firstName = first_name,
            lastName = last_name,
            phone = phone,
            note = note,
            roles = roles.mapNotNull(PortalRole.Companion::fromWire).distinct(),
            actorType = ActorType.fromWire(actor_type),
        )
    }
}
