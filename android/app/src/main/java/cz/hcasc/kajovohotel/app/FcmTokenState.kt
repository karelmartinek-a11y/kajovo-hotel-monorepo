package cz.hcasc.kajovohotel.app

import android.content.Context

internal object FcmTokenState {
    private const val PREFERENCES = "kajovo_fcm_state"
    private const val EMPLOYEE_SESSION = "employee_session"
    private const val PENDING_TOKEN = "pending_token"

    fun setEmployeeSession(context: Context, active: Boolean) {
        preferences(context).edit().putBoolean(EMPLOYEE_SESSION, active).apply()
    }

    fun hasEmployeeSession(context: Context): Boolean = preferences(context).getBoolean(EMPLOYEE_SESSION, false)

    fun savePendingToken(context: Context, token: String) {
        preferences(context).edit().putString(PENDING_TOKEN, token).apply()
    }

    fun clearPendingToken(context: Context, token: String) {
        val prefs = preferences(context)
        if (prefs.getString(PENDING_TOKEN, null) == token) prefs.edit().remove(PENDING_TOKEN).apply()
    }

    private fun preferences(context: Context) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
