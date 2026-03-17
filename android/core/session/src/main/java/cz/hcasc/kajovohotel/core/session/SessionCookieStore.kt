package cz.hcasc.kajovohotel.core.session

import cz.hcasc.kajovohotel.core.network.cookie.PersistingCookieJar

interface SessionCookieStore {
    fun clearAll()
}

class CookieBackedSessionCookieStore(private val cookieJar: PersistingCookieJar) : SessionCookieStore {
    override fun clearAll() {
        cookieJar.clearAll()
    }
}
