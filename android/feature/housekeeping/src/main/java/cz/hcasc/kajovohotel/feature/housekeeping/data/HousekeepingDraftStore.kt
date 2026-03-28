package cz.hcasc.kajovohotel.feature.housekeeping.data

import android.content.Context
import android.util.Base64
import com.squareup.moshi.Json
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingCaptureDraft
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

interface HousekeepingDraftStore {
    suspend fun load(): StoredHousekeepingDraft?
    suspend fun save(draft: HousekeepingCaptureDraft, photos: List<BinaryPayload>)
    suspend fun clear()
}

data class StoredHousekeepingDraft(
    val draft: HousekeepingCaptureDraft,
    val photos: List<BinaryPayload>,
    val updatedAtMillis: Long,
)

@Singleton
class FileHousekeepingDraftStore @Inject constructor(
    @ApplicationContext private val context: Context,
) : HousekeepingDraftStore {
    private val moshi = Moshi.Builder()
        .addLast(KotlinJsonAdapterFactory())
        .build()
    private val adapter = moshi.adapter(HousekeepingDraftSnapshot::class.java)
    private val file = File(context.filesDir, "housekeeping-draft.json")

    override suspend fun load(): StoredHousekeepingDraft? = withContext(Dispatchers.IO) {
        if (!file.exists()) {
            return@withContext null
        }
        val snapshot = runCatching { adapter.fromJson(file.readText(Charsets.UTF_8)) }.getOrNull() ?: return@withContext null
        return@withContext StoredHousekeepingDraft(
            draft = HousekeepingCaptureDraft(
                mode = snapshot.mode.toHousekeepingCaptureMode(),
                roomNumber = snapshot.roomNumber,
                description = snapshot.description,
            ),
            photos = snapshot.photos.map { photo ->
                BinaryPayload(
                    fileName = photo.fileName,
                    mimeType = photo.mimeType,
                    bytes = Base64.decode(photo.bytesBase64, Base64.DEFAULT),
                )
            },
            updatedAtMillis = snapshot.updatedAtMillis,
        )
    }

    override suspend fun save(draft: HousekeepingCaptureDraft, photos: List<BinaryPayload>) {
        withContext(Dispatchers.IO) {
            if (draft.isEmpty() && photos.isEmpty()) {
                file.delete()
                return@withContext
            }
            val snapshot = HousekeepingDraftSnapshot(
                mode = draft.mode.name,
                roomNumber = draft.roomNumber,
                description = draft.description,
                updatedAtMillis = System.currentTimeMillis(),
                photos = photos.map { photo ->
                    StoredBinaryPayload(
                        fileName = photo.fileName,
                        mimeType = photo.mimeType,
                        bytesBase64 = Base64.encodeToString(photo.bytes, Base64.NO_WRAP),
                    )
                },
            )
            file.writeText(adapter.toJson(snapshot), Charsets.UTF_8)
        }
    }

    override suspend fun clear() {
        withContext(Dispatchers.IO) {
            file.delete()
        }
    }
}

private data class HousekeepingDraftSnapshot(
    @Json(name = "mode") val mode: String,
    @Json(name = "room_number") val roomNumber: String,
    @Json(name = "description") val description: String,
    @Json(name = "updated_at_millis") val updatedAtMillis: Long,
    @Json(name = "photos") val photos: List<StoredBinaryPayload>,
)

private data class StoredBinaryPayload(
    @Json(name = "file_name") val fileName: String,
    @Json(name = "mime_type") val mimeType: String,
    @Json(name = "bytes_base64") val bytesBase64: String,
)

private fun String.toHousekeepingCaptureMode(): HousekeepingCaptureMode =
    runCatching { HousekeepingCaptureMode.valueOf(this) }.getOrDefault(HousekeepingCaptureMode.ISSUE)
