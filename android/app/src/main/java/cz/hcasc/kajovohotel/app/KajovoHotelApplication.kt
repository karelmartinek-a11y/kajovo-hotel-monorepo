package cz.hcasc.kajovohotel.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class KajovoHotelApplication : Application() {
    companion object {
        const val BREAKFAST_MULTIDAY_IMPORT_ENABLED: Boolean = true
    }
}
