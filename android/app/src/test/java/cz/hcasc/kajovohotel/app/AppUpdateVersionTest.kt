package cz.hcasc.kajovohotel.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateVersionTest {
    @Test
    fun detectsNewerVersionCode() {
        assertTrue(isRemoteVersionNewer(5, 6))
        assertTrue(isRemoteVersionNewer(100, 101))
    }

    @Test
    fun ignoresSameOrOlderVersionCode() {
        assertFalse(isRemoteVersionNewer(5, 5))
        assertFalse(isRemoteVersionNewer(6, 5))
    }

    @Test
    fun keepsFallbackSemanticComparator() {
        assertTrue(isRemoteVersionNameNewer("0.1.0", "0.2.0"))
        assertFalse(isRemoteVersionNameNewer("0.2.0", "0.1.9"))
    }
}
