package cz.hcasc.kajovohotel.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateVersionTest {
    @Test
    fun detectsNewerSemanticVersion() {
        assertTrue(isRemoteVersionNewer("0.1.0", "0.2.0"))
        assertTrue(isRemoteVersionNewer("1.9.9", "1.10.0"))
    }

    @Test
    fun ignoresSameOrOlderVersion() {
        assertFalse(isRemoteVersionNewer("0.1.0", "0.1.0"))
        assertFalse(isRemoteVersionNewer("0.2.0", "0.1.9"))
    }
}
