package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.model.PortalRole
import org.junit.Assert.assertEquals
import org.junit.Test

class PortalRoleParsingTest {
    @Test
    fun `parser rozpozna ceske role s diakritikou`() {
        assertEquals(PortalRole.HOUSEKEEPING, PortalRole.fromWire("pokojská"))
        assertEquals(PortalRole.MAINTENANCE, PortalRole.fromWire("údržba"))
        assertEquals(PortalRole.BREAKFAST, PortalRole.fromWire("snídaně"))
    }

    @Test
    fun `parser zachova kompatibilitu pro ascii a starsi rozbite aliasy`() {
        assertEquals(PortalRole.HOUSEKEEPING, PortalRole.fromWire("pokojska"))
        assertEquals(PortalRole.MAINTENANCE, PortalRole.fromWire("udrzba"))
        assertEquals(PortalRole.BREAKFAST, PortalRole.fromWire("snidane"))
    }
}
