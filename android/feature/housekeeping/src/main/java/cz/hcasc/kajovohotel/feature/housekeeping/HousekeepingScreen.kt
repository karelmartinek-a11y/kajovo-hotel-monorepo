package cz.hcasc.kajovohotel.feature.housekeeping

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import androidx.core.content.FileProvider
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.StatePane
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.housekeeping.domain.housekeepingRooms
import cz.hcasc.kajovohotel.feature.housekeeping.presentation.HousekeepingViewModel
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun HousekeepingScreen(
    role: PortalRole = PortalRole.HOUSEKEEPING,
    permissions: Set<String> = setOf("issues:write", "lost_found:write"),
    viewModel: HousekeepingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(maxItems = 3)) { uris ->
        viewModel.appendPendingPhotos(uris.mapNotNull { readBinaryPayload(context, it) })
    }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            pendingCameraUri?.let { uri ->
                finalizeHousekeepingCaptureUri(context, uri)
                readBinaryPayload(context, uri)?.let { payload ->
                    viewModel.appendPendingPhotos(listOf(payload))
                }
            }
        } else {
            pendingCameraUri?.let { uri -> deleteHousekeepingCaptureUri(context, uri) }
        }
        pendingCameraUri = null
    }

    LaunchedEffect(role, permissions) {
        viewModel.configure(role, permissions)
    }

    if (state.successReference != null) {
        StatePane(
            title = "Zápis odeslán",
            body = "Úspěšně byl odeslán záznam ${state.successReference}.",
            actionLabel = "Nový záznam",
            onAction = viewModel::startNewEntry,
        )
        return
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item { Text(text = "Pokojská", style = MaterialTheme.typography.headlineMedium) }
        item {
            FeatureCard(
                title = "Přehled pokojů",
                subtitle = if (state.housekeepingStatusIsCurrent) {
                    "Pobyty patří vybranému dni, stav úklidu je aktuální."
                } else {
                    "Stav úklidu není aktuální. Obnovte přehled."
                },
            )
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
            ) {
                OutlinedButton(
                    onClick = { viewModel.changeDate(LocalDate.parse(state.selectedDate).minusDays(1).toString()) },
                    enabled = !state.isSavingRoom,
                ) { Text("Předchozí") }
                OutlinedButton(
                    onClick = { viewModel.changeDate(LocalDate.now(ZoneId.of("Europe/Prague")).toString()) },
                    enabled = !state.isSavingRoom,
                ) { Text("Dnes") }
                OutlinedButton(
                    onClick = { viewModel.changeDate(LocalDate.parse(state.selectedDate).plusDays(1).toString()) },
                    enabled = !state.isSavingRoom,
                ) { Text("Další") }
            }
        }
        item { Text("Datum: ${state.selectedDate}", style = MaterialTheme.typography.titleMedium) }
        if (state.isLoadingRooms) {
            item { CircularProgressIndicator() }
        }
        state.roomsError?.let { message ->
            item {
                FeatureCard(title = "Přehled pokojů není dostupný", subtitle = message)
                OutlinedButton(onClick = viewModel::loadRooms, modifier = Modifier.fillMaxWidth()) { Text("Obnovit") }
            }
        }
        state.roomAnnouncement?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
        state.rooms.groupBy { it.floor }.forEach { (floor, rooms) ->
            item { Text(floor, style = MaterialTheme.typography.titleLarge) }
            items(rooms.size) { index ->
                val room = rooms[index]
                OutlinedCard(
                    onClick = { if (state.canWriteRooms) viewModel.selectRoom(room.room_id) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(KajovoSpacingTokens.S3),
                        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S1),
                    ) {
                        Text("Pokoj ${room.room_number}", style = MaterialTheme.typography.titleMedium)
                        Text(room.housekeeping_status ?: "Stav úklidu není uveden")
                        Text("${room.occupancy_state} · ${room.persons} osob")
                        room.guest_label?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                        if (room.arrival_today) Text(if (room.ready_for_arrival) "Příjezd · připraven" else "Příjezd · čeká na přípravu")
                        if (room.departure_today) Text(if (room.checked_out) "Odjezd · CHECK-OUT" else "Odjezd · před CHECK-OUT")
                    }
                }
            }
        }
        item {
            FeatureCard(
                title = "Rychlé zadání závady nebo nálezu",
                subtitle = "Vyberte typ zápisu, pokoj, krátký text a přiložte až 3 fotografie.",
            )
        }
        item { Text(text = state.draftNotice, style = MaterialTheme.typography.bodyMedium) }
        state.photoLimitMessage?.let { message ->
            item {
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                FilterChip(
                    selected = state.draft.mode == HousekeepingCaptureMode.LOST_FOUND,
                    onClick = { viewModel.updateDraft { current -> current.copy(mode = HousekeepingCaptureMode.LOST_FOUND) } },
                    enabled = state.canCreateLostFound,
                    label = { Text("Nález") },
                )
                FilterChip(
                    selected = state.draft.mode == HousekeepingCaptureMode.ISSUE,
                    onClick = { viewModel.updateDraft { current -> current.copy(mode = HousekeepingCaptureMode.ISSUE) } },
                    enabled = state.canCreateIssue,
                    label = { Text("Závada") },
                )
            }
        }
        item {
            RoomPicker(
                selectedRoom = state.draft.roomNumber,
                onSelectRoom = { room -> viewModel.updateDraft { current -> current.copy(roomNumber = room) } },
            )
        }
        item {
            OutlinedTextField(
                value = state.draft.description,
                onValueChange = { value -> viewModel.updateDraft { current -> current.copy(description = value) } },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(if (state.draft.mode == HousekeepingCaptureMode.ISSUE) "Krátký popis závady" else "Krátký popis nálezu") },
                singleLine = true,
            )
        }
        if (state.pendingPhotos.isNotEmpty()) {
            item { Text(text = "Vybrané fotografie: ${state.pendingPhotos.size}/3", style = MaterialTheme.typography.bodyMedium) }
            itemsIndexed(state.pendingPhotos) { index, payload ->
                PendingPhotoCard(
                    payload = payload,
                    onRemove = { viewModel.removePendingPhoto(index) },
                )
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                Button(
                    onClick = {
                        createHousekeepingCaptureUri(context)?.let { captureUri ->
                            pendingCameraUri = captureUri
                            cameraLauncher.launch(captureUri)
                        }
                    },
                    enabled = state.pendingPhotos.size < 3,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Vyfotit")
                }
                OutlinedButton(
                    onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = state.pendingPhotos.size < 3,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Přidat z galerie")
                }
                if (state.pendingPhotos.isNotEmpty()) {
                    OutlinedButton(
                        onClick = viewModel::clearPendingPhotos,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Vyčistit fotografie")
                    }
                }
                Button(
                    onClick = viewModel::submit,
                    enabled = !state.isSubmitting && state.draft.isValid(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Odeslat")
                }
            }
        }
        state.errorMessage?.let { message ->
            item { FeatureCard(title = "Chyba zápisu pokojské", subtitle = message) }
        }
    }

    val selectedRoom = state.rooms.firstOrNull { it.room_id == state.selectedRoomId }
    if (selectedRoom != null) {
        AlertDialog(
            onDismissRequest = { if (!state.isSavingRoom) viewModel.selectRoom(null) },
            title = { Text("Pokoj ${selectedRoom.room_number}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                    Text("Vyberte nový stav. Zápis se po ověření serverem uloží a přehled se automaticky obnoví.")
                    housekeepingStatuses.forEach { (value, label) ->
                        OutlinedButton(
                            onClick = { viewModel.updateRoomStatus(value) },
                            enabled = !state.isSavingRoom && state.roomWriteError == null,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(label) }
                    }
                    if (state.isSavingRoom) Text("Ověřuji zápis…")
                    state.roomWriteError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {
                if (state.roomWriteError != null) {
                    Button(onClick = viewModel::recoverRoomState) { Text("Obnovit stav") }
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { viewModel.selectRoom(null) }, enabled = !state.isSavingRoom) { Text("Zavřít") }
            },
        )
    }
}

private val housekeepingStatuses = listOf(
    "clean" to "Uklizeno pro nájezd",
    "dirty" to "Neuklizeno",
    "stay_no_linen" to "Pobyt – bez ložního prádla",
    "stay_with_linen" to "Uklizeno – s ložním prádlem",
    "do_not_disturb" to "Nerušenka",
    "technical_issue" to "Technický problém",
)

@Composable
private fun PendingPhotoCard(
    payload: BinaryPayload,
    onRemove: () -> Unit,
) {
    val context = LocalContext.current
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(payload.bytes)
                    .build(),
                contentDescription = "Náhled fotografie pokojské",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
                contentScale = ContentScale.Crop,
            )
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
            ) {
                Text(text = payload.fileName, style = MaterialTheme.typography.titleMedium)
                Text(text = payload.mimeType, style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(
                    onClick = onRemove,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Odebrat fotografii")
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RoomPicker(
    selectedRoom: String,
    onSelectRoom: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        Text(text = "Pokoj", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        ) {
            housekeepingRooms.forEach { room ->
                FilterChip(
                    selected = selectedRoom == room,
                    onClick = { onSelectRoom(room) },
                    label = { Text(room) },
                )
            }
        }
    }
}

private fun readBinaryPayload(context: Context, uri: Uri): BinaryPayload? {
    val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
    val fileName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameColumn >= 0 && cursor.moveToFirst()) cursor.getString(nameColumn) else null
    } ?: uri.lastPathSegment?.substringAfterLast('/') ?: "capture.jpg"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return BinaryPayload(fileName = fileName, mimeType = mimeType, bytes = bytes)
}

private fun createHousekeepingCaptureUri(context: Context): Uri? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val fileName = housekeepingCaptureFileName()
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/Kajovo Hotel")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        return context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
    }

    val directory = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "KajovoHotel").apply { mkdirs() }
    val file = File(directory, housekeepingCaptureFileName())
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

private fun housekeepingCaptureFileName(): String {
    val formatter = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss").withZone(ZoneId.systemDefault())
    return "kajovo_housekeeping_${formatter.format(Instant.now())}.jpg"
}

private fun finalizeHousekeepingCaptureUri(context: Context, uri: Uri) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.IS_PENDING, 0)
    }
    context.contentResolver.update(uri, values, null, null)
}

private fun deleteHousekeepingCaptureUri(context: Context, uri: Uri) {
    context.contentResolver.delete(uri, null, null)
}
