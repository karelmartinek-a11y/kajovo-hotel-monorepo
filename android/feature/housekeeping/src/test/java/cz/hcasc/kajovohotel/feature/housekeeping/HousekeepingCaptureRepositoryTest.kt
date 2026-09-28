package cz.hcasc.kajovohotel.feature.housekeeping

import cz.hcasc.kajovohotel.core.common.AppResult
import cz.hcasc.kajovohotel.feature.housekeeping.data.HousekeepingCaptureRepository
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingCaptureDraft
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HousekeepingCaptureRepositoryTest {
    @Test
    fun submitIssueReturnsSuccessReference() = runTest {
        val repository = HousekeepingCaptureRepository(FakeIssuesApi(), FakeLostFoundApi(), FakeHousekeepingApi())
        val result = repository.submit(HousekeepingCaptureDraft(roomNumber = "101", description = "Žárovka"), emptyList())
        assertTrue(result is AppResult.Success)
        assertEquals("Závada #11", (result as AppResult.Success).value)
    }

    @Test
    fun roomStatusUpdateReturnsVerifiedServerRoom() = runTest {
        val housekeepingApi = FakeHousekeepingApi()
        val repository = HousekeepingCaptureRepository(FakeIssuesApi(), FakeLostFoundApi(), housekeepingApi)
        val result = repository.updateRoomStatus("101", "2026-09-18", "clean", "dirty")
        assertTrue(result is AppResult.Success)
        assertEquals("clean", (result as AppResult.Success).value.housekeeping_status)
        assertEquals("dirty", housekeepingApi.lastStatusUpdateRequest?.expected_status)
    }
}
