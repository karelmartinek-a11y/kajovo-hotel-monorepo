package cz.hcasc.kajovohotel.core.network

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed interface AuthNetworkEvent {
    val message: String?

    data class Unauthorized(override val message: String? = null) : AuthNetworkEvent
    data class RoleSelectionRequired(override val message: String? = null) : AuthNetworkEvent
    data class AccessDenied(override val message: String? = null) : AuthNetworkEvent
    data class Maintenance(override val message: String? = null) : AuthNetworkEvent
    data class Offline(override val message: String? = null) : AuthNetworkEvent
}

interface AuthNetworkEventStore {
    val events: SharedFlow<AuthNetworkEvent>
    fun publish(event: AuthNetworkEvent)
}

class InMemoryAuthNetworkEventStore : AuthNetworkEventStore {
    private val mutableEvents = MutableSharedFlow<AuthNetworkEvent>(extraBufferCapacity = 32)
    override val events: SharedFlow<AuthNetworkEvent> = mutableEvents.asSharedFlow()

    override fun publish(event: AuthNetworkEvent) {
        mutableEvents.tryEmit(event)
    }
}
