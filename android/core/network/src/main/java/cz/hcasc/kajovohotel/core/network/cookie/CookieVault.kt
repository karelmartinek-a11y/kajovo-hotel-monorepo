package cz.hcasc.kajovohotel.core.network.cookie

import okhttp3.Cookie

data class PersistedCookie(
    val name: String,
    val value: String,
    val domain: String,
    val path: String,
    val expiresAt: Long,
    val secure: Boolean,
    val httpOnly: Boolean,
    val hostOnly: Boolean,
) {
    fun toCookie(): Cookie {
        val builder = Cookie.Builder().name(name).value(value).path(path).expiresAt(expiresAt)
        if (hostOnly) builder.hostOnlyDomain(domain) else builder.domain(domain)
        if (secure) builder.secure()
        if (httpOnly) builder.httpOnly()
        return builder.build()
    }

    companion object {
        fun fromCookie(cookie: Cookie): PersistedCookie = PersistedCookie(cookie.name, cookie.value, cookie.domain, cookie.path, cookie.expiresAt, cookie.secure, cookie.httpOnly, cookie.hostOnly)
    }
}

interface CookieVault {
    fun load(): List<PersistedCookie>
    fun save(cookies: List<PersistedCookie>)
    fun clear()
}
