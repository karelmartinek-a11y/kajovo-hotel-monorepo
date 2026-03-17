package cz.hcasc.kajovohotel.feature.issues

import cz.hcasc.kajovohotel.core.model.IssueStatus
import cz.hcasc.kajovohotel.core.model.allowedMaintenanceTransitions
import org.junit.Assert.assertEquals
import org.junit.Test

class IssueGuardTest {
    @Test
    fun maintenanceTransitionsFollowBackendGuards() {
        assertEquals(setOf(IssueStatus.IN_PROGRESS), allowedMaintenanceTransitions(IssueStatus.NEW))
        assertEquals(setOf(IssueStatus.RESOLVED), allowedMaintenanceTransitions(IssueStatus.IN_PROGRESS))
        assertEquals(emptySet<IssueStatus>(), allowedMaintenanceTransitions(IssueStatus.RESOLVED))
    }
}
