package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.model.ActorType
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.core.model.PortalRole
import org.junit.Assert.assertEquals
import org.junit.Test

class RootDestinationResolverTest {
    @Test
    fun `chat is available to employee sessions but remains excluded from admin app sessions`() {
        val employee = AuthenticatedIdentity(
            email = "recepce@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(PortalRole.RECEPTION),
            activeRole = PortalRole.RECEPTION,
            permissions = emptySet(),
        )
        val admin = employee.copy(actorType = ActorType.ADMIN)

        assertEquals(true, employee.canOpenDestination(PortalRoutes.Chat))
        assertEquals(false, admin.canOpenDestination(PortalRoutes.Chat))
    }

    @Test
    fun `unauthenticated state opens login`() {
        assertEquals(PortalRoutes.Login, resolveRootRoute(SessionState.Unauthenticated))
    }

    @Test
    fun `multi role portal identity without active role opens the first available module`() {
        val identity = AuthenticatedIdentity(
            email = "recepce@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(PortalRole.RECEPTION, PortalRole.BREAKFAST),
            activeRole = null,
            permissions = setOf("breakfast:read"),
        )

        assertEquals(PortalRoutes.Reception, resolveRootRoute(SessionState.Authenticated(identity)))
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

    @Test
    fun `breakfast footer route selects breakfast role when employee also has reception access`() {
        val identity = AuthenticatedIdentity(
            email = "recepce@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(PortalRole.RECEPTION, PortalRole.BREAKFAST),
            activeRole = PortalRole.RECEPTION,
            permissions = emptySet(),
        )

        assertEquals(PortalRole.BREAKFAST, identity.roleForModuleRoute(PortalRoutes.Breakfast))
        assertEquals(PortalRole.RECEPTION, identity.roleForModuleRoute(PortalRoutes.LostFound))
    }
}
