package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.model.ActorType
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.core.model.PortalRole
import org.junit.Assert.assertEquals
import org.junit.Test

class RootDestinationResolverTest {
    @Test
    fun `unauthenticated state opens login`() {
        assertEquals(PortalRoutes.Login, resolveRootRoute(SessionState.Unauthenticated))
    }

    @Test
    fun `multi role portal identity without active role opens role selection`() {
        val identity = AuthenticatedIdentity(
            email = "recepce@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(PortalRole.RECEPTION, PortalRole.BREAKFAST),
            activeRole = null,
            permissions = emptySet(),
        )

        assertEquals(PortalRoutes.Roles, resolveRootRoute(SessionState.Authenticated(identity)))
    }

    @Test
    fun `permissions can resolve a single role without dropping assigned role list`() {
        val identity = AuthenticatedIdentity(
            email = "sklad@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "sklad",
            roles = listOf(PortalRole.RECEPTION, PortalRole.INVENTORY),
            activeRole = null,
            permissions = setOf("inventory:read", "inventory:write"),
        )

        assertEquals(listOf(PortalRole.RECEPTION, PortalRole.INVENTORY), identity.assignedRoles())
        assertEquals(PortalRoutes.Inventory, resolveRootRoute(SessionState.Authenticated(identity)))
    }

    @Test
    fun `single role identity opens role home route`() {
        val identity = AuthenticatedIdentity(
            email = "snidane@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "snídaně",
            roles = listOf(PortalRole.BREAKFAST),
            activeRole = PortalRole.BREAKFAST,
            permissions = setOf("breakfast:read", "breakfast:write"),
        )

        assertEquals(PortalRoutes.Breakfast, resolveRootRoute(SessionState.Authenticated(identity)))
    }
}
