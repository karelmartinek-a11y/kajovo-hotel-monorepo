package cz.hcasc.kajovohotel.core.network.cookie

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class PersistingCookieJar(private val vault: CookieVault) : CookieJar {
    private val cookies = mutableListOf<Cookie>()

    init {
        cookies += vault.load().map { it.toCookie() }.filterNot { it.expiresAt < System.currentTimeMillis() }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val survivors = this.cookies.filterNot { stored -> cookies.any { incoming -> incoming.name == stored.name && incoming.domain == stored.domain && incoming.path == stored.path } }.toMutableList()
        survivors += cookies.filter { it.expiresAt >= System.currentTimeMillis() }
        this.cookies.clear()
        this.cookies += survivors
        persist()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        val valid = cookies.filter { it.expiresAt >= now && it.matches(url) }
        if (valid.size != cookies.size) {
            cookies.retainAll { it.expiresAt >= now }
            persist()
        }
        return valid
    }

    fun currentCookieValue(name: String): String? = cookies.lastOrNull { it.name == name }?.value
    fun clearAll() { cookies.clear(); vault.clear() }
    private fun persist() = vault.save(cookies.map(PersistedCookie.Companion::fromCookie))
}
