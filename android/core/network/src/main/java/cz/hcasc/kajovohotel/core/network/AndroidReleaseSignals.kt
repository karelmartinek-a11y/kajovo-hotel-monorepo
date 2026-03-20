package cz.hcasc.kajovohotel.core.network

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

data class AndroidReleaseSignal(
    val versionCode: Int,
    val required: Boolean,
)

interface AndroidReleaseSignalStore {
    val signals: SharedFlow<AndroidReleaseSignal>
    fun publish(signal: AndroidReleaseSignal)
}

class InMemoryAndroidReleaseSignalStore : AndroidReleaseSignalStore {
    private val mutableSignals = MutableSharedFlow<AndroidReleaseSignal>(extraBufferCapacity = 8)
    override val signals: SharedFlow<AndroidReleaseSignal> = mutableSignals.asSharedFlow()

    override fun publish(signal: AndroidReleaseSignal) {
        mutableSignals.tryEmit(signal)
    }
}
