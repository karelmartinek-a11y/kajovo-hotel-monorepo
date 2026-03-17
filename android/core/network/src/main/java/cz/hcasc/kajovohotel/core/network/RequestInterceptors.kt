package cz.hcasc.kajovohotel.core.network

import cz.hcasc.kajovohotel.core.network.cookie.PersistingCookieJar
import java.io.IOException
import java.util.UUID
import okhttp3.Interceptor
import okhttp3.Response

class RequestIdInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder().header("x-request-id", UUID.randomUUID().toString()).build()
        return chain.proceed(request)
    }
}

class CsrfTokenInterceptor(private val cookieJar: PersistingCookieJar) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
        if (chain.request().method !in setOf("GET", "HEAD")) {
            val token = cookieJar.currentCookieValue("kajovo_csrf")
            if (!token.isNullOrBlank()) {
                builder.header("x-csrf-token", token)
            }
        }
        return chain.proceed(builder.build())
    }
}

class SessionGuardInterceptor(private val eventStore: AuthNetworkEventStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        return try {
            val response = chain.proceed(request)
            val detail = response.peekBody(2048).string().extractDetailMessage()
            when {
                response.code == 401 && request.url.encodedPath != "/api/auth/login" -> {
                    eventStore.publish(AuthNetworkEvent.Unauthorized(detail ?: "Session vypršela nebo už není platná."))
                }
                response.code == 403 && detail == "Active role must be selected" -> {
                    eventStore.publish(AuthNetworkEvent.RoleSelectionRequired("Vyberte aktivní roli pro pokračování."))
                }
                response.code == 403 -> {
                    eventStore.publish(AuthNetworkEvent.AccessDenied(detail ?: "Server odmítl přístup k požadované akci."))
                }
                response.code == 503 -> {
                    eventStore.publish(AuthNetworkEvent.Maintenance(detail ?: "Server je dočasně v maintenance režimu."))
                }
            }
            response
        } catch (ioException: IOException) {
            eventStore.publish(AuthNetworkEvent.Offline("Síť není dostupná nebo server neodpovídá."))
            throw ioException
        }
    }
}

private fun String.extractDetailMessage(): String? {
    val keyIndex = indexOf("\"detail\"")
    if (keyIndex == -1) {
        return null
    }
    val colonIndex = indexOf(':', startIndex = keyIndex)
    val firstQuote = indexOf('"', startIndex = colonIndex + 1)
    val secondQuote = indexOf('"', startIndex = firstQuote + 1)
    if (colonIndex == -1 || firstQuote == -1 || secondQuote == -1) {
        return null
    }
    return substring(firstQuote + 1, secondQuote)
}
