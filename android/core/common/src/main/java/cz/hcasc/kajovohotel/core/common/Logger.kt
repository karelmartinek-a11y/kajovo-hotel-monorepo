package cz.hcasc.kajovohotel.core.common

import android.util.Log

class AppLogger(private val tag: String = "KajovoHotelAndroid") {
    fun info(message: String) {
        runCatching { Log.i(tag, message) }.getOrElse { println("INFO[$tag]: $message") }
    }

    fun error(message: String, throwable: Throwable? = null) {
        runCatching { Log.e(tag, message, throwable) }
            .getOrElse {
                println("ERROR[$tag]: $message")
                throwable?.printStackTrace()
            }
    }
}
