package cz.hcasc.kajovohotel.feature.housekeeping

import cz.hcasc.kajovohotel.core.network.api.IssuesApi
import cz.hcasc.kajovohotel.core.network.api.LostFoundApi
import cz.hcasc.kajovohotel.core.network.dto.IssueCreateDto
import cz.hcasc.kajovohotel.core.network.dto.IssueDto
import cz.hcasc.kajovohotel.core.network.dto.IssueUpdateDto
import cz.hcasc.kajovohotel.core.network.dto.LostFoundItemCreateDto
import cz.hcasc.kajovohotel.core.network.dto.LostFoundItemDto
import cz.hcasc.kajovohotel.core.network.dto.LostFoundItemUpdateDto
import cz.hcasc.kajovohotel.core.network.dto.MediaPhotoDto
import okhttp3.MultipartBody

internal class FakeIssuesApi : IssuesApi {
    override suspend fun list(priority: String?, status: String?, location: String?, roomNumber: String?): List<IssueDto> = emptyList()
    override suspend fun detail(issueId: Int): IssueDto = error("unused")
    override suspend fun create(request: IssueCreateDto): IssueDto = IssueDto(id = 11, title = request.title, location = request.location, description = request.description, room_number = request.room_number)
    override suspend fun update(issueId: Int, request: IssueUpdateDto): IssueDto = error("unused")
    override suspend fun listPhotos(issueId: Int): List<MediaPhotoDto> = emptyList()
    override suspend fun uploadPhotos(issueId: Int, photos: List<MultipartBody.Part>): List<MediaPhotoDto> = emptyList()
}

internal class FakeLostFoundApi : LostFoundApi {
    override suspend fun list(itemType: String?, status: String?, category: String?): List<LostFoundItemDto> = emptyList()
    override suspend fun detail(itemId: Int): LostFoundItemDto = error("unused")
    override suspend fun create(request: LostFoundItemCreateDto): LostFoundItemDto = LostFoundItemDto(id = 21, category = request.category, description = request.description, location = request.location, event_at = request.event_at)
    override suspend fun update(itemId: Int, request: LostFoundItemUpdateDto): LostFoundItemDto = error("unused")
    override suspend fun listPhotos(itemId: Int): List<MediaPhotoDto> = emptyList()
    override suspend fun uploadPhotos(itemId: Int, photos: List<MultipartBody.Part>): List<MediaPhotoDto> = emptyList()
}
