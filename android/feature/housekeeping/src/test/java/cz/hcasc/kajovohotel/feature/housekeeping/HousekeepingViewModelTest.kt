package cz.hcasc.kajovohotel.feature.housekeeping

import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode
import cz.hcasc.kajovohotel.feature.housekeeping.data.HousekeepingCaptureRepository
import cz.hcasc.kajovohotel.feature.housekeeping.data.HousekeepingDraftStore
import cz.hcasc.kajovohotel.feature.housekeeping.data.StoredHousekeepingDraft
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingCaptureDraft
import cz.hcasc.kajovohotel.feature.housekeeping.presentation.HousekeepingViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HousekeepingViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun restoresStoredDraftAfterViewModelInit() = runTest(testDispatcher) {
        val expectedPhoto = photo("kabat.jpg", 1)
        val draftStore = FakeHousekeepingDraftStore(
            storedDraft = StoredHousekeepingDraft(
                draft = HousekeepingCaptureDraft(
                    mode = HousekeepingCaptureMode.LOST_FOUND,
                    roomNumber = "205",
                    description = "Kabát na posteli",
                ),
                photos = listOf(expectedPhoto),
                updatedAtMillis = 1_741_112_800_000,
            ),
        )

        val viewModel = HousekeepingViewModel(
            repository = HousekeepingCaptureRepository(FakeIssuesApi(), FakeLostFoundApi()),
            draftStore = draftStore,
        )

        advanceUntilIdle()

        assertEquals(HousekeepingCaptureMode.LOST_FOUND, viewModel.state.value.draft.mode)
        assertEquals("205", viewModel.state.value.draft.roomNumber)
        assertEquals("Kabát na posteli", viewModel.state.value.draft.description)
        assertEquals(listOf(expectedPhoto), viewModel.state.value.pendingPhotos)
        assertEquals(0, draftStore.clearCalls)
        assertNotNull(viewModel.state.value.draftNotice.takeIf { it.startsWith("Obnoven lokální koncept z ") })
    }

    @Test
    fun trimsPhotoSelectionToThreeAndClearsLimitMessageAfterRemovingOne() = runTest(testDispatcher) {
        val draftStore = FakeHousekeepingDraftStore()
        val viewModel = HousekeepingViewModel(
            repository = HousekeepingCaptureRepository(FakeIssuesApi(), FakeLostFoundApi()),
            draftStore = draftStore,
        )

        viewModel.appendPendingPhotos(
            listOf(
                photo("1.jpg", 1),
                photo("2.jpg", 2),
                photo("3.jpg", 3),
                photo("4.jpg", 4),
            ),
        )
        advanceUntilIdle()

        assertEquals(listOf("1.jpg", "2.jpg", "3.jpg"), viewModel.state.value.pendingPhotos.map { it.fileName })
        assertEquals("Lze připojit nejvýše 3 fotografie.", viewModel.state.value.photoLimitMessage)
        assertEquals(listOf("1.jpg", "2.jpg", "3.jpg"), draftStore.lastSavedPhotos.map { it.fileName })

        viewModel.removePendingPhoto(1)
        advanceUntilIdle()

        assertEquals(listOf("1.jpg", "3.jpg"), viewModel.state.value.pendingPhotos.map { it.fileName })
        assertNull(viewModel.state.value.photoLimitMessage)
        assertEquals(listOf("1.jpg", "3.jpg"), draftStore.lastSavedPhotos.map { it.fileName })
    }

    @Test
    fun submitClearsStoredDraftAfterSuccessfulSend() = runTest(testDispatcher) {
        val draftStore = FakeHousekeepingDraftStore()
        val viewModel = HousekeepingViewModel(
            repository = HousekeepingCaptureRepository(FakeIssuesApi(), FakeLostFoundApi()),
            draftStore = draftStore,
        )

        viewModel.updateDraft {
            it.copy(
                mode = HousekeepingCaptureMode.ISSUE,
                roomNumber = "101",
                description = "Rozbité světlo",
            )
        }
        viewModel.appendPendingPhotos(listOf(photo("issue.jpg", 7)))
        advanceUntilIdle()

        viewModel.submit()
        advanceUntilIdle()

        assertEquals(1, draftStore.clearCalls)
        assertEquals("Závada #11", viewModel.state.value.successReference)
        assertEquals(emptyList<BinaryPayload>(), viewModel.state.value.pendingPhotos)
        assertEquals(HousekeepingCaptureMode.ISSUE, viewModel.state.value.draft.mode)
    }

    private fun photo(fileName: String, seed: Int): BinaryPayload = BinaryPayload(
        fileName = fileName,
        mimeType = "image/jpeg",
        bytes = byteArrayOf(seed.toByte(), (seed + 1).toByte(), (seed + 2).toByte()),
    )
}

private class FakeHousekeepingDraftStore(
    private val storedDraft: StoredHousekeepingDraft? = null,
) : HousekeepingDraftStore {
    var lastSavedDraft: HousekeepingCaptureDraft? = null
        private set

    var lastSavedPhotos: List<BinaryPayload> = emptyList()
        private set

    var clearCalls: Int = 0
        private set

    override suspend fun load(): StoredHousekeepingDraft? = storedDraft

    override suspend fun save(draft: HousekeepingCaptureDraft, photos: List<BinaryPayload>) {
        lastSavedDraft = draft
        lastSavedPhotos = photos
    }

    override suspend fun clear() {
        clearCalls += 1
        lastSavedDraft = null
        lastSavedPhotos = emptyList()
    }
}
