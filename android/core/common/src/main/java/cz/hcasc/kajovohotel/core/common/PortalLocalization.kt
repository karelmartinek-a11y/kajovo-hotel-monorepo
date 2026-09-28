package cz.hcasc.kajovohotel.core.common

import android.content.Context
import android.util.Log
import java.util.Locale
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject

object PortalLocalization {
    private const val PREFERENCES = "kajovo_portal_preferences"
    private const val LOCALE_KEY = "portal_locale"
    private const val TRANSLATIONS_ASSET = "portal-translations.json"
    private val translations = AtomicReference<Map<String, JSONObject>?>(null)
    private val localeState = MutableStateFlow("cs")
    private var applicationContext: Context? = null

    val locale: StateFlow<String> = localeState

    fun initialize(context: Context): String {
        applicationContext = context.applicationContext
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val saved = preferences.getString(LOCALE_KEY, null)
        val deviceLocale = Locale.getDefault().language
        val value = normalize(saved ?: deviceLocale)
        localeState.value = value
        return value
    }

    fun setLocale(context: Context, value: String) {
        val normalized = normalize(value)
        applicationContext = context.applicationContext
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putString(LOCALE_KEY, normalized).apply()
        localeState.value = normalized
    }

    fun text(source: String, language: String = localeState.value): String {
        val normalized = normalize(language)
        if (normalized == "cs") return source
        val context = applicationContext ?: return source
        return runCatching {
            val dictionary = translations.get() ?: loadTranslations(context).also(translations::set)
            dictionary[normalized]?.optString(source)?.takeIf { it.isNotBlank() } ?: source
        }.onFailure { Log.w("PortalLocalization", "Translation lookup failed", it) }
            .getOrDefault(source)
    }

    private fun loadTranslations(context: Context): Map<String, JSONObject> {
        val text = context.assets.open(TRANSLATIONS_ASSET).bufferedReader(Charsets.UTF_8).use { it.readText() }
        val root = JSONObject(text)
        return listOf("en", "uk").associateWith { language -> root.optJSONObject(language) ?: JSONObject() }
    }

    private fun normalize(value: String?): String = when (value?.trim()?.lowercase()?.take(2)) {
        "en" -> "en"
        "uk" -> "uk"
        else -> "cs"
    }
}
