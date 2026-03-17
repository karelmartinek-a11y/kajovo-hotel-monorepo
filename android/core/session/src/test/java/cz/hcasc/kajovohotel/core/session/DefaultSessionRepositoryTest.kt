package cz.hcasc.kajovohotel.core.session

import cz.hcasc.kajovohotel.core.common.AppLogger
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.database.ModuleSnapshotDao
import cz.hcasc.kajovohotel.core.database.ModuleSnapshotEntity
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
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class DefaultSessionRepositoryTest {
    @Test
    fun `restore session keeps authenticated state with role selection pending`() = runTest {
        val authApi = FakeAuthApi(
            meResult = Result.success(
                AuthIdentityDto(
                    email = "recepce@example.com",
                    role = "recepce",
                    roles = listOf("recepce", "snídaně"),
                    active_role = null,
                    permissions = emptyList(),
                    actor_type = "portal",
                ),
            ),
        )
        val metadataStore = FakeMetadataStore()
        val repository = DefaultSessionRepository(authApi, FakeCookieStore(), metadataStore, FakeModuleSnapshotDao(), AppLogger())

        repository.restoreSession()

        val state = repository.sessionState.value as SessionState.Authenticated
        assertTrue(state.identity.requiresRoleSelection())
        assertEquals(listOf(PortalRole.RECEPTION, PortalRole.BREAKFAST), state.identity.roles)
        assertEquals("recepce@example.com", metadataStore.lastLogin)
        assertNotNull(metadataStore.snapshot)
    }

    @Test
    fun `restore session falls back to cached identity when backend requires role selection`() = runTest {
        val metadataStore = FakeMetadataStore().apply {
            snapshot = SessionIdentitySnapshot(
                email = "recepce@example.com",
                actorType = "portal",
                roles = listOf("recepce", "snídaně"),
                permissions = setOf("breakfast:read", "breakfast:write"),
            )
        }
        val repository = DefaultSessionRepository(
            authApi = FakeAuthApi(meResult = Result.failure(httpException(403, "Active role must be selected"))),
            cookieStore = FakeCookieStore(),
            metadataStore = metadataStore,
            moduleSnapshotDao = FakeModuleSnapshotDao(),
            logger = AppLogger(),
        )

        repository.restoreSession()

        val state = repository.sessionState.value as SessionState.Authenticated
        assertTrue(state.identity.requiresRoleSelection())
        assertEquals(setOf("breakfast:read", "breakfast:write"), state.identity.permissions)
        assertNull(state.identity.activeRole)
    }

    @Test
    fun `logout clears cookies metadata and room cache`() = runTest {
        val authApi = FakeAuthApi(logoutResult = Result.success(Response.success(Unit)))
        val metadataStore = FakeMetadataStore()
        val cookieStore = FakeCookieStore()
        val dao = FakeModuleSnapshotDao()
        val repository = DefaultSessionRepository(authApi, cookieStore, metadataStore, dao, AppLogger())

        repository.logout()

        assertTrue(cookieStore.cleared)
        assertTrue(metadataStore.cleared)
        assertTrue(dao.cleared)
        assertTrue(repository.sessionState.value is SessionState.Unauthenticated)
    }

    @Test
    fun `401 network event clears local session`() = runTest {
        val repository = DefaultSessionRepository(
            authApi = FakeAuthApi(),
            cookieStore = FakeCookieStore(),
            metadataStore = FakeMetadataStore(),
            moduleSnapshotDao = FakeModuleSnapshotDao(),
            logger = AppLogger(),
        )

        repository.handleNetworkEvent(AuthNetworkEvent.Unauthorized("expired"))

        assertTrue(repository.sessionState.value is SessionState.Unauthenticated)
    }

    @Test
    fun `change password success logs user out`() = runTest {
        val authApi = FakeAuthApi(
            changePasswordResult = Result.success(Response.success(Unit)),
            meResult = Result.success(
                AuthIdentityDto(
                    email = "recepce@example.com",
                    role = "recepce",
                    roles = listOf("recepce"),
                    active_role = "recepce",
                    permissions = listOf("breakfast:read"),
                    actor_type = "portal",
                ),
            ),
        )
        val metadataStore = FakeMetadataStore()
        val cookieStore = FakeCookieStore()
        val dao = FakeModuleSnapshotDao()
        val repository = DefaultSessionRepository(authApi, cookieStore, metadataStore, dao, AppLogger())

        repository.restoreSession()
        val result = repository.changePassword("old-password", "new-password")

        assertTrue(result is AppResult.Success)
        assertTrue(cookieStore.cleared)
        assertTrue(metadataStore.cleared)
        assertTrue(dao.cleared)
        assertTrue(repository.sessionState.value is SessionState.Unauthenticated)
    }

    private class FakeAuthApi(
        private val loginResult: Result<AuthIdentityDto> = Result.success(
            AuthIdentityDto(
                email = "recepce@example.com",
                role = "recepce",
                roles = listOf("recepce"),
                active_role = "recepce",
                permissions = listOf("breakfast:read"),
                actor_type = "portal",
            ),
        ),
        private val meResult: Result<AuthIdentityDto> = Result.failure(httpException(401, "Authentication required")),
        private val selectRoleResult: Result<AuthIdentityDto> = Result.success(
            AuthIdentityDto(
                email = "recepce@example.com",
                role = "recepce",
                roles = listOf("recepce"),
                active_role = "recepce",
                permissions = listOf("breakfast:read"),
                actor_type = "portal",
            ),
        ),
        private val logoutResult: Result<Response<Unit>> = Result.success(Response.success(Unit)),
        private val profileResult: Result<AuthProfileDto> = Result.success(
            AuthProfileDto(
                email = "recepce@example.com",
                first_name = "Recepční",
                last_name = "Test",
                phone = null,
                note = null,
                roles = listOf("recepce"),
                actor_type = "portal",
            ),
        ),
        private val updateProfileResult: Result<AuthProfileDto> = profileResult,
        private val changePasswordResult: Result<Response<Unit>> = Result.success(Response.success(Unit)),
    ) : AuthApi {
        override suspend fun login(request: PortalLoginRequest): AuthIdentityDto = loginResult.getOrThrow()
        override suspend fun me(): AuthIdentityDto = meResult.getOrThrow()
        override suspend fun selectRole(request: SelectRoleRequest): AuthIdentityDto = selectRoleResult.getOrThrow()
        override suspend fun logout(): Response<Unit> = logoutResult.getOrThrow()
        override suspend fun profile(): AuthProfileDto = profileResult.getOrThrow()
        override suspend fun updateProfile(request: AuthProfileUpdateRequest): AuthProfileDto = updateProfileResult.getOrThrow()
        override suspend fun changePassword(request: PortalPasswordChangeRequest): Response<Unit> = changePasswordResult.getOrThrow()
    }

    private class FakeCookieStore : SessionCookieStore {
        var cleared = false
        override fun clearAll() {
            cleared = true
        }
    }

    private class FakeMetadataStore : SessionMetadataStore {
        var lastLogin: String? = null
        var activeRole: String? = null
        var snapshot: SessionIdentitySnapshot? = null
        var cleared = false

        override suspend fun saveLastLogin(email: String) {
            lastLogin = email
        }

        override suspend fun saveActiveRole(role: String?) {
            activeRole = role
        }

        override suspend fun saveIdentitySnapshot(snapshot: SessionIdentitySnapshot) {
            this.snapshot = snapshot
        }

        override suspend fun loadIdentitySnapshot(): SessionIdentitySnapshot? = snapshot

        override suspend fun clear() {
            cleared = true
            lastLogin = null
            activeRole = null
            snapshot = null
        }
    }

    private class FakeModuleSnapshotDao : ModuleSnapshotDao {
        var cleared = false
        override suspend fun get(key: String): ModuleSnapshotEntity? = null
        override suspend fun upsert(entity: ModuleSnapshotEntity) = Unit
        override suspend fun clearAll() {
            cleared = true
        }
    }

    private companion object {
        fun httpException(code: Int, detail: String): HttpException {
            val body = "{\"detail\":\"$detail\"}".toResponseBody("application/json".toMediaType())
            return HttpException(Response.error<Any>(code, body))
        }
    }
}
