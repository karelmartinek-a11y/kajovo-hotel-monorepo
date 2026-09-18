package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.model.ActorType
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.HotelModule
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.canCreateIssueFromHousekeeping
import cz.hcasc.kajovohotel.core.model.canCreateLostFoundFromHousekeeping
import cz.hcasc.kajovohotel.core.model.canSubmitInventoryMovement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionGuardTest {
    @Test
    fun housekeepingWritePermissionsControlQuickCaptureModes() {
        assertTrue(canCreateIssueFromHousekeeping(PortalRole.HOUSEKEEPING, setOf("issues:write")))
        assertTrue(canCreateLostFoundFromHousekeeping(PortalRole.HOUSEKEEPING, setOf("lost_found:write")))
        assertFalse(canCreateIssueFromHousekeeping(PortalRole.HOUSEKEEPING, emptySet()))
    }

    @Test
    fun inventoryMovementRequiresInventoryRoleAndWritePermission() {
        assertTrue(canSubmitInventoryMovement(PortalRole.INVENTORY, setOf("inventory:write")))
        assertFalse(canSubmitInventoryMovement(PortalRole.RECEPTION, setOf("inventory:write")))
    }

    @Test
    fun inaccessibleRouteFallsBackToAccessDenied() {
        val identity = AuthenticatedIdentity(
            email = "reception@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(PortalRole.RECEPTION),
            activeRole = PortalRole.RECEPTION,
            permissions = setOf("breakfast:read", "breakfast:write", "lost_found:read", "lost_found:write"),
        )
        assertFalse(identity.canAccess(HotelModule.INVENTORY))
        assertFalse(identity.canOpenDestination(PortalRoutes.Inventory))
    }

    @Test
    fun reportsRouteIsAvailableForReceptionAndInventoryRoles() {
        val reception = AuthenticatedIdentity(
            email = "recepce@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(PortalRole.RECEPTION),
            activeRole = PortalRole.RECEPTION,
            permissions = setOf("reports:read", "reports:write"),
        )
        val inventory = AuthenticatedIdentity(
            email = "sklad@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "sklad",
            roles = listOf(PortalRole.INVENTORY),
            activeRole = PortalRole.INVENTORY,
            permissions = setOf("inventory:read", "inventory:write", "reports:read"),
        )

        assertTrue(reception.canAccess(HotelModule.REPORTS))
        assertTrue(reception.canOpenDestination(PortalRoutes.Reports))
        assertTrue(inventory.canAccess(HotelModule.REPORTS))
        assertTrue(inventory.canOpenDestination(PortalRoutes.Reports))
    }

    @Test
    fun assignedPortalRolesStayVisibleEvenWithoutModuleReadPermission() {
        val identity = AuthenticatedIdentity(
            email = "karel.martinek@post.cz",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(
                PortalRole.HOUSEKEEPING,
                PortalRole.MAINTENANCE,
                PortalRole.RECEPTION,
                PortalRole.BREAKFAST,
                PortalRole.INVENTORY,
            ),
            activeRole = PortalRole.HOUSEKEEPING,
            permissions = setOf("breakfast:write", "lost_found:write"),
        )

        assertTrue(identity.accessibleRoles().containsAll(identity.roles))
        assertEquals(identity.roles, identity.assignedRoles())
        assertTrue(identity.canOpenDestination(PortalRoutes.Housekeeping))
    }

    @Test
    fun roleSelectionKeepsAssignedRolesEvenWhenPermissionsResolveOnlyPartOfThem() {
        val identity = AuthenticatedIdentity(
            email = "karel.martinek@post.cz",
            actorType = ActorType.PORTAL,
            roleLabel = "recepce",
            roles = listOf(
                PortalRole.RECEPTION,
                PortalRole.HOUSEKEEPING,
                PortalRole.MAINTENANCE,
                PortalRole.BREAKFAST,
                PortalRole.INVENTORY,
            ),
            activeRole = null,
            permissions = setOf("breakfast:write", "issues:write"),
        )

        assertEquals(
            listOf(
                PortalRole.RECEPTION,
                PortalRole.HOUSEKEEPING,
                PortalRole.MAINTENANCE,
                PortalRole.BREAKFAST,
                PortalRole.INVENTORY,
            ),
            identity.assignedRoles(),
        )
        assertEquals(
            listOf(
                PortalRole.RECEPTION,
                PortalRole.HOUSEKEEPING,
                PortalRole.MAINTENANCE,
                PortalRole.BREAKFAST,
            ),
            identity.resolvableRolesForPermissions(),
        )
        assertEquals(null, identity.resolvedActiveRole())
    }

    @Test
    fun resolvedActiveRoleFallsBackToTheOnlyPermissionCompatibleRole() {
        val identity = AuthenticatedIdentity(
            email = "sklad@example.com",
            actorType = ActorType.PORTAL,
            roleLabel = "sklad",
            roles = listOf(PortalRole.RECEPTION, PortalRole.INVENTORY),
            activeRole = null,
            permissions = setOf("inventory:read", "inventory:write"),
        )

        assertEquals(listOf(PortalRole.RECEPTION, PortalRole.INVENTORY), identity.assignedRoles())
        assertEquals(listOf(PortalRole.INVENTORY), identity.resolvableRolesForPermissions())
        assertEquals(PortalRole.INVENTORY, identity.resolvedActiveRole())
        assertEquals("Sklad", identity.displayRole())
    }
}
