package cz.hcasc.kajovohotel.core.session

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.model.AuthProfile
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.core.network.AuthNetworkEvent
import kotlinx.coroutines.flow.StateFlow

interface SessionRepository {
    val sessionState: StateFlow<SessionState>
    suspend fun restoreSession()
    suspend fun signIn(email: String, password: String)
    suspend fun selectRole(role: PortalRole)
    suspend fun logout()
    suspend fun handleNetworkEvent(event: AuthNetworkEvent)
    suspend fun loadProfile(): AppResult<AuthProfile>
    suspend fun updateProfile(firstName: String, lastName: String, phone: String?, note: String?): AppResult<AuthProfile>
    suspend fun changePassword(oldPassword: String, newPassword: String): AppResult<Unit>
}
