package cz.hcasc.kajovohotel.core.session

import cz.hcasc.kajovohotel.core.model.BlockingUtilityState
import java.io.IOException
import retrofit2.HttpException

data class SessionErrorResolution(
    val message: String,
    val clearLocalSession: Boolean = false,
    val requireRoleSelection: Boolean = false,
    val utilityState: BlockingUtilityState? = null,
)

object SessionErrorMapper {
    fun resolve(throwable: Throwable, fallbackMessage: String): SessionErrorResolution {
        val httpException = throwable as? HttpException
        val detail = httpException?.response()?.errorBody()?.string()?.extractDetail()
        return when {
            throwable is IOException -> SessionErrorResolution(
                message = "Síť není dostupná. Zkontrolujte připojení a opakujte akci.",
                utilityState = BlockingUtilityState.OFFLINE,
            )
            httpException?.code() == 401 -> SessionErrorResolution(
                message = detail ?: "Přihlášení vypršelo. Přihlaste se znovu.",
                clearLocalSession = true,
            )
            httpException?.code() == 403 && detail == "Active role must be selected" -> SessionErrorResolution(
                message = "Vyberte aktivní roli pro pokračování.",
                requireRoleSelection = true,
            )
            httpException?.code() == 403 -> SessionErrorResolution(
                message = detail ?: fallbackMessage,
            )
            httpException?.code() == 409 -> SessionErrorResolution(
                message = detail ?: fallbackMessage,
            )
            httpException?.code() == 503 -> SessionErrorResolution(
                message = detail ?: "Server je dočasně v maintenance režimu.",
                utilityState = BlockingUtilityState.MAINTENANCE,
            )
            httpException != null && httpException.code() >= 500 -> SessionErrorResolution(
                message = detail ?: "Server vrátil neočekávanou chybu.",
                utilityState = BlockingUtilityState.GLOBAL_BLOCKING_ERROR,
            )
            else -> SessionErrorResolution(message = detail ?: fallbackMessage)
        }
    }
}

private fun String.extractDetail(): String? {
    val keyIndex = indexOf("\"detail\"")
    if (keyIndex == -1) return null
    val colonIndex = indexOf(':', startIndex = keyIndex)
    val firstQuote = indexOf('"', startIndex = colonIndex + 1)
    val secondQuote = indexOf('"', startIndex = firstQuote + 1)
    if (colonIndex == -1 || firstQuote == -1 || secondQuote == -1) return null
    return substring(firstQuote + 1, secondQuote)
}
