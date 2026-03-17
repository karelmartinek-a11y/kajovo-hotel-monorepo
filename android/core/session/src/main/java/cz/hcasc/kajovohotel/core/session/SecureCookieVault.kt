package cz.hcasc.kajovohotel.core.session

import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import cz.hcasc.kajovohotel.core.network.cookie.CookieVault
import cz.hcasc.kajovohotel.core.network.cookie.PersistedCookie
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureCookieVault(private val sharedPreferences: SharedPreferences, moshi: Moshi) : CookieVault {
    private val listType = Types.newParameterizedType(List::class.java, PersistedCookie::class.java)
    private val adapter = moshi.adapter<List<PersistedCookie>>(listType)

    override fun load(): List<PersistedCookie> {
        val payload = sharedPreferences.getString(PAYLOAD_KEY, null) ?: return emptyList()
        return runCatching {
            val parts = payload.split(":", limit = 2)
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(128, iv))
            val clearText = cipher.doFinal(encrypted).decodeToString()
            adapter.fromJson(clearText).orEmpty()
        }.getOrElse { emptyList() }
    }

    override fun save(cookies: List<PersistedCookie>) {
        if (cookies.isEmpty()) {
            clear()
            return
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val clearText = adapter.toJson(cookies).encodeToByteArray()
        val encrypted = cipher.doFinal(clearText)
        val payload = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP)
        sharedPreferences.edit().putString(PAYLOAD_KEY, payload).apply()
    }

    override fun clear() {
        sharedPreferences.edit().remove(PAYLOAD_KEY).apply()
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val existing = keyStore.getKey(ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "kajovo_hotel_cookie_vault"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val PAYLOAD_KEY = "cookie_payload"
    }
}
