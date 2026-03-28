package cz.hcasc.kajovohotel.feature.breakfast

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.network.api.BreakfastApi
import cz.hcasc.kajovohotel.core.network.dto.BreakfastDailySummaryDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastImportItemDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastImportResponseDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderCreateDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderDto
import cz.hcasc.kajovohotel.core.network.dto.BreakfastOrderUpdateDto
import cz.hcasc.kajovohotel.feature.breakfast.data.BreakfastRepository
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDietKey
import cz.hcasc.kajovohotel.feature.breakfast.presentation.BreakfastViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class BreakfastViewModelTest {
    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun receptionBatchSavePersistsQueuedBreakfastChanges() = runTest {
        val api = FakeBreakfastApi(
            ordersByDate = mutableMapOf(
                "2026-03-28" to mutableListOf(
                    breakfastOrderDto(
                        id = 11,
                        serviceDate = "2026-03-28",
                        roomNumber = "204",
                        guestName = "Jana Svobodová",
                        status = "served",
                    ),
                ),
            ),
            summariesByDate = mutableMapOf(
                "2026-03-28" to BreakfastDailySummaryDto(
                    service_date = "2026-03-28",
                    total_orders = 1,
                    total_guests = 2,
                    status_counts = mapOf("pending" to 0, "served" to 1),
                ),
            ),
        )
        val viewModel = BreakfastViewModel(BreakfastRepository(api, BaseUrlConfig("https://hotel.hcasc.cz")))

        viewModel.load(PortalRole.RECEPTION, "2026-03-28")
        advanceUntilIdle()

        viewModel.returnToPending(11)
        viewModel.toggleQueuedDiet(11, BreakfastDietKey.NO_GLUTEN)

        assertEquals(1, viewModel.state.value.queuedDrafts.size)

        viewModel.saveQueuedDrafts()
        advanceUntilIdle()

        assertEquals(1, api.updateRequests.size)
        assertEquals("pending", api.updateRequests.single().second.status)
        assertEquals(true, api.updateRequests.single().second.diet_no_gluten)
        assertTrue(viewModel.state.value.queuedDrafts.isEmpty())
        assertEquals("pending", api.ordersByDate.getValue("2026-03-28").single().status)
    }

    @Test
    fun confirmImportSavesEditedDietOverridesAndClosesPreview() = runTest {
        val api = FakeBreakfastApi(
            ordersByDate = mutableMapOf(
                "2026-03-30" to mutableListOf(
                    breakfastOrderDto(
                        id = 21,
                        serviceDate = "2026-03-30",
                        roomNumber = "301",
                        guestName = "Host import",
                    ),
                ),
            ),
            summariesByDate = mutableMapOf(
                "2026-03-30" to BreakfastDailySummaryDto(
                    service_date = "2026-03-30",
                    total_orders = 1,
                    total_guests = 2,
                    status_counts = mapOf("pending" to 1, "served" to 0),
                ),
            ),
            previewResponse = BreakfastImportResponseDto(
                date = "2026-03-30",
                status = "FOUND",
                saved = false,
                items = listOf(
                    BreakfastImportItemDto(
                        room = 301,
                        count = 2,
                        guest_name = "Host import",
                        diet_no_gluten = false,
                        diet_no_milk = false,
                        diet_no_pork = false,
                    ),
                ),
            ),
            saveResponse = BreakfastImportResponseDto(
                date = "2026-03-30",
                status = "FOUND",
                saved = true,
                items = listOf(
                    BreakfastImportItemDto(
                        room = 301,
                        count = 2,
                        guest_name = "Host import",
                        diet_no_gluten = true,
                        diet_no_milk = false,
                        diet_no_pork = false,
                    ),
                ),
            ),
        )
        val viewModel = BreakfastViewModel(BreakfastRepository(api, BaseUrlConfig("https://hotel.hcasc.cz")))
        val file = BinaryPayload(
            fileName = "breakfast-import.pdf",
            mimeType = "application/pdf",
            bytes = "pdf".encodeToByteArray(),
        )

        viewModel.load(PortalRole.RECEPTION, "2026-03-30")
        advanceUntilIdle()

        viewModel.importPreview(file)
        advanceUntilIdle()

        assertEquals(1, viewModel.state.value.importPreview?.items?.size)

        viewModel.toggleImportDiet(0, BreakfastDietKey.NO_GLUTEN)
        viewModel.confirmImport()
        advanceUntilIdle()

        assertEquals(
            """[{"room":"301","diet_no_gluten":true,"diet_no_milk":false,"diet_no_pork":false}]""",
            api.savedOverridesJson,
        )
        assertNull(viewModel.state.value.importPreview)
        assertNull(viewModel.state.value.pendingImportFile)
        assertFalse(viewModel.state.value.isSubmitting)
        assertEquals("2026-03-30", viewModel.state.value.serviceDate)
        assertEquals(1, viewModel.state.value.orders.size)
    }

    @Test
    fun selectOrderByIdLoadsDetailEvenWhenCurrentDayListDoesNotContainIt() = runTest {
        val api = FakeBreakfastApi(
            ordersByDate = mutableMapOf(
                "2026-03-28" to mutableListOf(),
                "2026-03-31" to mutableListOf(
                    breakfastOrderDto(
                        id = 41,
                        serviceDate = "2026-03-31",
                        roomNumber = "401",
                        guestName = "Mimo den",
                    ),
                ),
            ),
            summariesByDate = mutableMapOf(
                "2026-03-28" to BreakfastDailySummaryDto(
                    service_date = "2026-03-28",
                    total_orders = 0,
                    total_guests = 0,
                    status_counts = mapOf("pending" to 0, "served" to 0),
                ),
                "2026-03-31" to BreakfastDailySummaryDto(
                    service_date = "2026-03-31",
                    total_orders = 1,
                    total_guests = 2,
                    status_counts = mapOf("pending" to 1, "served" to 0),
                ),
            ),
        )
        val viewModel = BreakfastViewModel(BreakfastRepository(api, BaseUrlConfig("https://hotel.hcasc.cz")))

        viewModel.load(PortalRole.RECEPTION, "2026-03-28")
        advanceUntilIdle()

        viewModel.selectOrderById(41)
        advanceUntilIdle()

        assertEquals(41, viewModel.state.value.selectedOrder?.id)
        assertEquals("2026-03-31", viewModel.state.value.serviceDate)
        assertEquals("401", viewModel.state.value.selectedOrder?.roomNumber)
    }

    @Test
    fun triggerExportPreparesBinaryFileForAndroidActions() = runTest {
        val api = FakeBreakfastApi(
            ordersByDate = mutableMapOf(
                "2026-03-29" to mutableListOf(),
            ),
            summariesByDate = mutableMapOf(
                "2026-03-29" to BreakfastDailySummaryDto(
                    service_date = "2026-03-29",
                    total_orders = 0,
                    total_guests = 0,
                    status_counts = mapOf("pending" to 0, "served" to 0),
                ),
            ),
            exportBody = "%PDF-1.7".encodeToByteArray(),
        )
        val viewModel = BreakfastViewModel(BreakfastRepository(api, BaseUrlConfig("https://hotel.hcasc.cz")))

        viewModel.load(PortalRole.RECEPTION, "2026-03-29")
        advanceUntilIdle()

        viewModel.triggerExport()
        advanceUntilIdle()

        assertEquals("snidane-2026-03-29.pdf", viewModel.state.value.exportFile?.fileName)
        assertEquals("application/pdf", viewModel.state.value.exportFile?.mimeType)
        assertEquals("%PDF-1.7", viewModel.state.value.exportFile?.bytes?.decodeToString())
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
private class MainDispatcherRule(
    private val dispatcher: StandardTestDispatcher = StandardTestDispatcher(),
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}

private class FakeBreakfastApi(
    val ordersByDate: MutableMap<String, MutableList<BreakfastOrderDto>> = mutableMapOf(),
    val summariesByDate: MutableMap<String, BreakfastDailySummaryDto> = mutableMapOf(),
    private val previewResponse: BreakfastImportResponseDto = BreakfastImportResponseDto(
        date = "2026-03-28",
        status = "FOUND",
        items = emptyList(),
    ),
    private val saveResponse: BreakfastImportResponseDto = BreakfastImportResponseDto(
        date = "2026-03-28",
        status = "FOUND",
        items = emptyList(),
        saved = true,
    ),
    private val exportBody: ByteArray = "%PDF".encodeToByteArray(),
) : BreakfastApi {
    val updateRequests = mutableListOf<Pair<Int, BreakfastOrderUpdateDto>>()
    var savedOverridesJson: String? = null

    override suspend fun list(serviceDate: String?, status: String?): List<BreakfastOrderDto> {
        return ordersByDate[serviceDate].orEmpty()
    }

    override suspend fun dailySummary(serviceDate: String): BreakfastDailySummaryDto {
        return summariesByDate.getValue(serviceDate)
    }

    override suspend fun detail(orderId: Int): BreakfastOrderDto {
        return ordersByDate.values.flatten().first { it.id == orderId }
    }

    override suspend fun create(request: BreakfastOrderCreateDto): BreakfastOrderDto {
        error("V tomto testu se create nepoužívá.")
    }

    override suspend fun update(orderId: Int, request: BreakfastOrderUpdateDto): BreakfastOrderDto {
        updateRequests += orderId to request
        val current = ordersByDate.values.flatten().first { it.id == orderId }
        val updated = current.copy(
            service_date = request.service_date ?: current.service_date,
            room_number = request.room_number ?: current.room_number,
            guest_name = request.guest_name ?: current.guest_name,
            guest_count = request.guest_count ?: current.guest_count,
            note = request.note ?: current.note,
            diet_no_gluten = request.diet_no_gluten ?: current.diet_no_gluten,
            diet_no_milk = request.diet_no_milk ?: current.diet_no_milk,
            diet_no_pork = request.diet_no_pork ?: current.diet_no_pork,
            status = request.status ?: current.status,
        )
        ordersByDate[updated.service_date] = ordersByDate[updated.service_date]
            ?.map { order -> if (order.id == orderId) updated else order }
            ?.toMutableList()
            ?: mutableListOf(updated)
        return updated
    }

    override suspend fun importPdf(
        file: MultipartBody.Part,
        save: RequestBody,
        overrides: RequestBody?,
    ): BreakfastImportResponseDto {
        val isSave = requestBodyText(save) == "true"
        if (isSave) {
            savedOverridesJson = overrides?.let(::requestBodyText)
            return saveResponse
        }
        return previewResponse
    }

    override suspend fun exportDaily(serviceDate: String): Response<ResponseBody> {
        return Response.success(exportBody.toResponseBody("application/pdf".toMediaType()))
    }
}

private fun requestBodyText(body: RequestBody): String {
    val buffer = Buffer()
    body.writeTo(buffer)
    return buffer.readUtf8()
}

private fun breakfastOrderDto(
    id: Int,
    serviceDate: String,
    roomNumber: String,
    guestName: String,
    status: String = "pending",
) = BreakfastOrderDto(
    id = id,
    service_date = serviceDate,
    room_number = roomNumber,
    guest_name = guestName,
    guest_count = 2,
    note = null,
    diet_no_gluten = false,
    diet_no_milk = false,
    diet_no_pork = false,
    status = status,
)
