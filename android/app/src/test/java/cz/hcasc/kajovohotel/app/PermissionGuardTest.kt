package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.model.ActorType
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.HotelModule
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.canCreateIssueFromHousekeeping
import cz.hcasc.kajovohotel.core.model.canCreateLostFoundFromHousekeeping
import cz.hcasc.kajovohotel.core.model.canSubmitInventoryMovement
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
        assertTrue(identity.canOpenDestination(PortalRoutes.Housekeeping))
    }
}
