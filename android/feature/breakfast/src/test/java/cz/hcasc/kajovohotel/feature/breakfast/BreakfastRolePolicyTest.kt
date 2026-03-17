package cz.hcasc.kajovohotel.feature.breakfast

import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.canManageBreakfast
import cz.hcasc.kajovohotel.core.model.canServeBreakfast
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BreakfastRolePolicyTest {
    @Test
    fun breakfastRoleVariantsRespectBackendScopedWrites() {
        assertTrue(canManageBreakfast(PortalRole.RECEPTION, setOf("breakfast:write")))
        assertTrue(canServeBreakfast(PortalRole.BREAKFAST, setOf("breakfast:write")))
        assertFalse(canManageBreakfast(PortalRole.BREAKFAST, setOf("breakfast:write")))
    }
}
