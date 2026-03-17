package cz.hcasc.kajovohotel.core.network

import java.io.IOException
import retrofit2.HttpException

fun Throwable.readableMessage(fallback: String): String {
    val detail = (this as? HttpException)?.response()?.errorBody()?.string()?.readDetailMessage()
    return when {
        this is IOException -> "Síť není dostupná. Opakujte akci po obnovení připojení."
        !detail.isNullOrBlank() -> detail
        else -> fallback
    }
}

fun Throwable.isNotFound(): Boolean = (this as? HttpException)?.code() == 404
fun Throwable.isForbidden(): Boolean = (this as? HttpException)?.code() == 403
fun Throwable.isOffline(): Boolean = this is IOException

private fun String.readDetailMessage(): String? {
    val keyIndex = indexOf("\"detail\"")
    if (keyIndex == -1) return null
    val colonIndex = indexOf(':', startIndex = keyIndex)
    val firstQuote = indexOf('"', startIndex = colonIndex + 1)
    val secondQuote = indexOf('"', startIndex = firstQuote + 1)
    if (colonIndex == -1 || firstQuote == -1 || secondQuote == -1) return null
    return substring(firstQuote + 1, secondQuote)
}
