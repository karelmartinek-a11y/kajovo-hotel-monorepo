package cz.hcasc.kajovohotel.core.network

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

data class AndroidReleaseSignal(
    val versionCode: Int,
    val required: Boolean,
)

interface AndroidReleaseSignalStore {
    val signals: SharedFlow<AndroidReleaseSignal>
    val latest: StateFlow<AndroidReleaseSignal?>
    fun publish(signal: AndroidReleaseSignal)
}

class PersistentAndroidReleaseSignalStore(context: Context) : AndroidReleaseSignalStore {
    private val preferences: SharedPreferences = context.applicationContext.getSharedPreferences("android_release_signal", Context.MODE_PRIVATE)
    private val mutableSignals = MutableSharedFlow<AndroidReleaseSignal>(extraBufferCapacity = 8)
    private val mutableLatest = MutableStateFlow(readLatest())
    override val signals: SharedFlow<AndroidReleaseSignal> = mutableSignals.asSharedFlow()
    override val latest: StateFlow<AndroidReleaseSignal?> = mutableLatest.asStateFlow()

    override fun publish(signal: AndroidReleaseSignal) {
        preferences.edit()
            .putInt("version_code", signal.versionCode)
            .putBoolean("required", signal.required)
            .apply()
        mutableLatest.value = signal
        mutableSignals.tryEmit(signal)
    }

    private fun readLatest(): AndroidReleaseSignal? {
        if (!preferences.contains("version_code")) return null
        return AndroidReleaseSignal(
            versionCode = preferences.getInt("version_code", 0),
            required = preferences.getBoolean("required", false),
        )
    }
}

class InMemoryAndroidReleaseSignalStore : AndroidReleaseSignalStore {
    private val mutableSignals = MutableSharedFlow<AndroidReleaseSignal>(extraBufferCapacity = 8)
    private val mutableLatest = MutableStateFlow<AndroidReleaseSignal?>(null)
    override val signals: SharedFlow<AndroidReleaseSignal> = mutableSignals.asSharedFlow()
    override val latest: StateFlow<AndroidReleaseSignal?> = mutableLatest.asStateFlow()

    override fun publish(signal: AndroidReleaseSignal) {
        mutableLatest.value = signal
        mutableSignals.tryEmit(signal)
    }
}
