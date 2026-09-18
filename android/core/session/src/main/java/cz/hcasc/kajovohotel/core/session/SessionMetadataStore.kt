package cz.hcasc.kajovohotel.core.session

data class SessionIdentitySnapshot(
    val email: String,
    val actorType: String,
    val roles: List<String>,
    val permissions: Set<String>,
)

interface SessionMetadataStore {
    suspend fun saveLastLogin(email: String)
    suspend fun saveActiveRole(role: String?)
    suspend fun saveIdentitySnapshot(snapshot: SessionIdentitySnapshot)
    suspend fun loadIdentitySnapshot(): SessionIdentitySnapshot?
    suspend fun clear()
}
