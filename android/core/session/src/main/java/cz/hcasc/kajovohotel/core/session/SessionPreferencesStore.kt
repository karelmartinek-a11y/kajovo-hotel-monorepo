package cz.hcasc.kajovohotel.core.session

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.flow.first

class SessionPreferencesStore(private val dataStore: DataStore<Preferences>) : SessionMetadataStore {
    override suspend fun saveLastLogin(email: String) {
        dataStore.edit { prefs ->
            prefs[LAST_EMAIL] = email
            prefs[LAST_TOUCHED] = System.currentTimeMillis()
        }
    }

    override suspend fun saveActiveRole(role: String?) {
        dataStore.edit { prefs ->
            if (role == null) {
                prefs.remove(ACTIVE_ROLE)
            } else {
                prefs[ACTIVE_ROLE] = role
            }
        }
    }

    override suspend fun saveIdentitySnapshot(snapshot: SessionIdentitySnapshot) {
        dataStore.edit { prefs ->
            prefs[SNAPSHOT_EMAIL] = snapshot.email
            prefs[SNAPSHOT_ACTOR_TYPE] = snapshot.actorType
            prefs[SNAPSHOT_ROLES] = snapshot.roles.toSet()
            prefs[SNAPSHOT_PERMISSIONS] = snapshot.permissions
        }
    }

    override suspend fun loadIdentitySnapshot(): SessionIdentitySnapshot? {
        val prefs = dataStore.data.first()
        val email = prefs[SNAPSHOT_EMAIL] ?: return null
        val actorType = prefs[SNAPSHOT_ACTOR_TYPE] ?: "portal"
        val roles = prefs[SNAPSHOT_ROLES]?.toList().orEmpty().sorted()
        val permissions = prefs[SNAPSHOT_PERMISSIONS].orEmpty()
        if (roles.isEmpty()) return null
        return SessionIdentitySnapshot(
            email = email,
            actorType = actorType,
            roles = roles,
            permissions = permissions,
        )
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    private companion object {
        val LAST_EMAIL = stringPreferencesKey("last_email")
        val ACTIVE_ROLE = stringPreferencesKey("active_role")
        val LAST_TOUCHED = longPreferencesKey("last_touched")
        val SNAPSHOT_EMAIL = stringPreferencesKey("snapshot_email")
        val SNAPSHOT_ACTOR_TYPE = stringPreferencesKey("snapshot_actor_type")
        val SNAPSHOT_ROLES = stringSetPreferencesKey("snapshot_roles")
        val SNAPSHOT_PERMISSIONS = stringSetPreferencesKey("snapshot_permissions")
    }
}
