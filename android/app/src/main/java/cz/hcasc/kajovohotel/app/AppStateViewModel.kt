package cz.hcasc.kajovohotel.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.model.AuthProfile
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.core.network.AndroidReleaseSignalStore
import cz.hcasc.kajovohotel.core.network.AuthNetworkEvent
import cz.hcasc.kajovohotel.core.network.AuthNetworkEventStore
import cz.hcasc.kajovohotel.core.network.api.AuthApi
import cz.hcasc.kajovohotel.core.network.dto.PortalPasswordResetRequest
import cz.hcasc.kajovohotel.core.network.readableMessage
import cz.hcasc.kajovohotel.core.session.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.net.URI
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@HiltViewModel
class AppStateViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val authApi: AuthApi,
    networkEventStore: AuthNetworkEventStore,
    androidReleaseSignalStore: AndroidReleaseSignalStore,
) : ViewModel() {
    val sessionState = sessionRepository.sessionState

    private val mutableProfile = MutableStateFlow<AuthProfile?>(null)
    val profile: StateFlow<AuthProfile?> = mutableProfile.asStateFlow()

    private val mutableMessage = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = mutableMessage.asStateFlow()

    private val mutableAppUpdateState = MutableStateFlow(AppUpdateState())
    val appUpdateState: StateFlow<AppUpdateState> = mutableAppUpdateState.asStateFlow()
    private var lastAutoStartedVersionCode: Int? = null

    init {
        viewModelScope.launch {
            networkEventStore.events.collectLatest { event ->
                sessionRepository.handleNetworkEvent(event)
                mutableMessage.value = event.message
                if (event is AuthNetworkEvent.Unauthorized) {
                    mutableProfile.value = null
                }
            }
        }
        viewModelScope.launch {
            androidReleaseSignalStore.signals.collectLatest { signal ->
                val currentKnownVersion = mutableAppUpdateState.value.availableUpdate?.latestVersionCode
                if (
                    signal.versionCode > BuildConfig.VERSION_CODE &&
                    signal.versionCode != currentKnownVersion &&
                    signal.versionCode != lastAutoStartedVersionCode
                ) {
                    checkForAppUpdate(autoStart = shouldAutoStartProductionUpdates())
                }
            }
        }
    }

    fun restoreSession() {
        viewModelScope.launch {
            mutableMessage.value = null
            checkForAppUpdate(autoStart = shouldAutoStartProductionUpdates())
            sessionRepository.restoreSession()
            refreshProfileIfAuthenticated()
        }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            mutableMessage.value = null
            sessionRepository.signIn(email, password, rememberMe = false)
            refreshProfileIfAuthenticated()
            if (sessionState.value is SessionState.Unauthenticated) {
                mutableProfile.value = null
            }
        }
    }

    fun selectRole(role: PortalRole) {
        viewModelScope.launch {
            mutableMessage.value = null
            sessionRepository.selectRole(role)
            refreshProfileIfAuthenticated()
        }
    }

    fun logout() {
        viewModelScope.launch {
            sessionRepository.logout()
            mutableProfile.value = null
            mutableMessage.value = null
        }
    }

    fun dismissAppUpdate() {
        mutableAppUpdateState.value = mutableAppUpdateState.value.copy(wasDismissed = true, pendingAutoStartVersionCode = null)
    }

    fun consumePendingAutoStart(versionCode: Int) {
        lastAutoStartedVersionCode = versionCode
        mutableAppUpdateState.value = mutableAppUpdateState.value.copy(pendingAutoStartVersionCode = null)
    }

    fun saveProfile(firstName: String, lastName: String, phone: String, note: String) {
        viewModelScope.launch {
            when (val result = sessionRepository.updateProfile(firstName, lastName, phone.ifBlank { null }, note.ifBlank { null })) {
                is AppResult.Success -> {
                    mutableProfile.value = result.value
                    mutableMessage.value = "Profil byl uložen."
                }

                is AppResult.Error -> mutableMessage.value = result.message
            }
        }
    }

    fun changePassword(oldPassword: String, newPassword: String) {
        viewModelScope.launch {
            when (val result = sessionRepository.changePassword(oldPassword, newPassword)) {
                is AppResult.Success -> {
                    mutableProfile.value = null
                    mutableMessage.value = "Heslo bylo změněno. Přihlaste se znovu."
                }

                is AppResult.Error -> mutableMessage.value = result.message
            }
        }
    }

    fun completePasswordReset(token: String, newPassword: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            mutableMessage.value = null
            runCatching {
                authApi.resetPassword(
                    PortalPasswordResetRequest(
                        token = token,
                        new_password = newPassword,
                    ),
                )
            }.onSuccess {
                mutableProfile.value = null
                mutableMessage.value = "Heslo bylo nastaveno. Přihlaste se novým heslem."
                onSuccess()
            }.onFailure { throwable ->
                mutableMessage.value = throwable.readableMessage("Reset hesla se nepodařilo dokončit.")
            }
        }
    }

    private suspend fun refreshProfileIfAuthenticated() {
        when (sessionState.value) {
            is SessionState.Authenticated -> {
                when (val result = sessionRepository.loadProfile()) {
                    is AppResult.Success -> mutableProfile.value = result.value
                    is AppResult.Error -> mutableMessage.value = result.message
                }
            }

            SessionState.Checking -> mutableProfile.value = null
            is SessionState.Failure -> mutableProfile.value = null
            SessionState.Unauthenticated -> mutableProfile.value = null
        }
    }

    private suspend fun checkForAppUpdate(autoStart: Boolean = false) {
        mutableAppUpdateState.value = mutableAppUpdateState.value.copy(isChecking = true)
        runCatching { authApi.androidRelease() }
            .onSuccess { dto ->
                val updateInfo = dto.toAppUpdateInfo(BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME)
                val isNewer = isRemoteVersionNewer(BuildConfig.VERSION_CODE, dto.version_code) ||
                    isRemoteVersionNameNewer(BuildConfig.VERSION_NAME, dto.version)
                mutableAppUpdateState.value = mutableAppUpdateState.value.copy(
                    isChecking = false,
                    availableUpdate = if (isNewer) updateInfo else null,
                    wasDismissed = false,
                    pendingAutoStartVersionCode = if (
                        isNewer &&
                        autoStart &&
                        lastAutoStartedVersionCode != dto.version_code
                    ) {
                        dto.version_code
                    } else {
                        null
                    },
                )
            }
            .onFailure {
                mutableAppUpdateState.value = mutableAppUpdateState.value.copy(
                    isChecking = false,
                    availableUpdate = null,
                    pendingAutoStartVersionCode = null,
                )
            }
    }

    private fun shouldAutoStartProductionUpdates(): Boolean {
        return runCatching { URI(BuildConfig.HOTEL_BASE_URL).host.equals("hotel.hcasc.cz", ignoreCase = true) }
            .getOrDefault(false)
    }
}
