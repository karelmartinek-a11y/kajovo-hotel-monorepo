package cz.hcasc.kajovohotel.core.session

import cz.hcasc.kajovohotel.core.network.cookie.PersistingCookieJar

interface SessionCookieStore {
    fun hasSessionCookieHint(): Boolean
    fun clearAll()
}

class CookieBackedSessionCookieStore(private val cookieJar: PersistingCookieJar) : SessionCookieStore {
    override fun hasSessionCookieHint(): Boolean {
        return !cookieJar.currentCookieValue("kajovo_session").isNullOrBlank() ||
            !cookieJar.currentCookieValue("kajovo_csrf").isNullOrBlank()
    }

    override fun clearAll() {
        cookieJar.clearAll()
    }
}
