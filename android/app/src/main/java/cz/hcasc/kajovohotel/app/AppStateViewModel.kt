package cz.hcasc.kajovohotel.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.core.model.AuthProfile
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.core.network.AuthNetworkEvent
import cz.hcasc.kajovohotel.core.network.AuthNetworkEventStore
import cz.hcasc.kajovohotel.core.session.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@HiltViewModel
class AppStateViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    networkEventStore: AuthNetworkEventStore,
) : ViewModel() {
    val sessionState = sessionRepository.sessionState

    private val mutableProfile = MutableStateFlow<AuthProfile?>(null)
    val profile: StateFlow<AuthProfile?> = mutableProfile.asStateFlow()

    private val mutableMessage = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = mutableMessage.asStateFlow()

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
    }

    fun restoreSession() {
        viewModelScope.launch {
            mutableMessage.value = null
            sessionRepository.restoreSession()
            refreshProfileIfAuthenticated()
        }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            mutableMessage.value = null
            sessionRepository.signIn(email, password)
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
}
