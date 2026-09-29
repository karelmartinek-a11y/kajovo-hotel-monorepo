package cz.hcasc.kajovohotel.feature.housekeeping

import cz.hcasc.kajovohotel.core.designsystem.localize

import android.content.ContentValues
import android.content.Context
import android.app.DatePickerDialog
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Surface
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.DisposableEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import androidx.core.content.FileProvider
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.common.PortalLocalization
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.StatePane
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.housekeeping.domain.housekeepingRooms
import cz.hcasc.kajovohotel.feature.housekeeping.domain.housekeepingTileAppearance
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingTileTone
import cz.hcasc.kajovohotel.feature.housekeeping.presentation.HousekeepingViewModel
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HousekeepingScreen(
    role: PortalRole = PortalRole.HOUSEKEEPING,
    permissions: Set<String> = setOf("issues:write", "lost_found:write"),
    viewModel: HousekeepingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val localeCode by PortalLocalization.locale.collectAsStateWithLifecycle()
    var captureMode by remember { mutableStateOf(false) }
    var legendExpanded by rememberSaveable { mutableStateOf(false) }
    var showStayPanel by remember { mutableStateOf(false) }
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
    LaunchedEffect(state.selectedDate) {
        while (true) {
            delay(60_000)
            viewModel.loadRooms()
        }
    }
    DisposableEffect(lifecycleOwner, state.selectedDate) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) viewModel.loadRooms() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(state.selectedRoomId) { showStayPanel = false }

    if (state.successReference != null) {
        StatePane(
            title = "Zápis odeslán",
            body = "Úspěšně byl odeslán záznam ${state.successReference}.",
            actionLabel = "Nový záznam",
            onAction = viewModel::startNewEntry,
        )
        return
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        if (!captureMode) {
        item {
            Text(localize("Pokoje"), style = MaterialTheme.typography.titleLarge)
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                OutlinedButton(
                    onClick = { viewModel.changeDate(LocalDate.parse(state.selectedDate).minusDays(1).toString()) },
                    enabled = !state.isSavingRoom,
                    modifier = Modifier.weight(0.8f).height(40.dp),
                ) { Text("‹", fontSize = 20.sp) }
                OutlinedButton(
                    onClick = {
                        val date = LocalDate.parse(state.selectedDate)
                        DatePickerDialog(context, { _, year, month, day -> viewModel.changeDate(LocalDate.of(year, month + 1, day).toString()) }, date.year, date.monthValue - 1, date.dayOfMonth).show()
                    },
                    enabled = !state.isSavingRoom,
                    modifier = Modifier.weight(2.8f).height(40.dp),
                ) { Text(LocalDate.parse(state.selectedDate).format(DateTimeFormatter.ofPattern("EEEE d. MMMM yyyy", Locale.forLanguageTag(localeCode))), maxLines = 1, fontSize = 11.sp) }
                OutlinedButton(
                    onClick = { viewModel.changeDate(LocalDate.parse(state.selectedDate).plusDays(1).toString()) },
                    enabled = !state.isSavingRoom,
                    modifier = Modifier.weight(0.8f).height(40.dp),
                ) { Text("›", fontSize = 20.sp) }
                OutlinedButton(
                    onClick = { viewModel.changeDate(LocalDate.now(ZoneId.of("Europe/Prague")).toString()) },
                    enabled = !state.isSavingRoom,
                    modifier = Modifier.weight(1.2f).height(40.dp),
                ) { Text(localize("Dnes"), fontSize = 11.sp) }
            }
        }
        item { Text(localize("Pobyty podle data · Obsazenost a úklid nyní."), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        item {
            Column {
                TextButton(onClick = { legendExpanded = !legendExpanded }, contentPadding = PaddingValues(horizontal = 0.dp, vertical = 2.dp)) { Text(localize("Vysvětlivky barev"), fontSize = 13.sp) }
                if (legendExpanded) Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(
                        0xFFF27A70 to "Odjezd bez check-out / příjezd nepřipraven",
                        0xFF2D9B49 to "Uklizený pokoj",
                        0xFF6AE878 to "Průběžně uklizený pokoj",
                        0xFFEADCF4 to "Nerušenka",
                        0xFFD9D8D3 to "Odjel po check-outu",
                        0xFFEEEBE4 to "Neuklizeno bez příjezdu a odjezdu nebo při pokračujícím pobytu",
                    ).forEach { (color, label) -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(14.dp).background(Color(color)))
                        Text(localize(label), fontSize = 11.sp)
                    } }
                }
            }
        }
        if (!state.housekeepingStatusIsCurrent) item { Text(localize("Stav úklidu není aktuální. Obnovte přehled."), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
        if (state.isLoadingRooms) {
            item { CircularProgressIndicator() }
        }
        state.roomsError?.let { message ->
            item {
                FeatureCard(title = "Přehled pokojů není dostupný", subtitle = message)
                OutlinedButton(onClick = viewModel::loadRooms, modifier = Modifier.fillMaxWidth()) { Text(localize("Obnovit")) }
            }
        }
        state.roomAnnouncement?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
        val orderedRooms = state.rooms.sortedBy { room -> housekeepingRooms.indexOf(room.room_number).let { if (it < 0) Int.MAX_VALUE else it } }
        items(orderedRooms.chunked(4).size) { rowIndex ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                orderedRooms.chunked(4)[rowIndex].forEach { room ->
                    val appearance = housekeepingTileAppearance(room)
                    val leftColor = housekeepingToneColor(appearance.left)
                    val rightColor = housekeepingToneColor(appearance.right)
                    val stays = room.departures + room.arrivals + room.stays
                    val notePending = stays.any { !it.housekeeping_note.isNullOrBlank() }
                    Surface(
                        onClick = { viewModel.selectRoom(room.room_id) },
                        modifier = Modifier
                            .weight(1f)
                            .height(106.dp)
                            .background(
                                brush = Brush.horizontalGradient(
                                    listOf(
                                        if (appearance.split) leftColor else housekeepingToneColor(appearance.full),
                                        if (appearance.split) rightColor else housekeepingToneColor(appearance.full),
                                    ),
                                ),
                                shape = RoundedCornerShape(4.dp),
                            )
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)),
                        shape = RoundedCornerShape(4.dp),
                        color = Color.Transparent,
                        tonalElevation = 0.dp,
                    ) {
                        Column(Modifier.fillMaxWidth().padding(5.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(room.room_number, style = MaterialTheme.typography.titleMedium.copy(fontSize = 20.sp, lineHeight = 20.sp), fontWeight = FontWeight.Bold)
                                Text((if (room.occupied) "●" else "○") + " " + if (room.occupied) room.persons else 0, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = if (room.occupied) Color(0xFF8B332E) else Color(0xFF5F625F))
                            }
                            if (notePending) Text("! ${localize("Poznámka pro pokojskou")}", style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp, lineHeight = 9.sp), maxLines = 1, color = MaterialTheme.colorScheme.error)
                            Text(localize(if (room.occupied) "Uvnitř teď" else "Prázdný teď"), style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, lineHeight = 10.sp), maxLines = 1)
                            Row(Modifier.fillMaxWidth().height(4.dp)) {
                                Box(Modifier.weight(1f).height(4.dp).background(if (appearance.split) leftColor else Color(0xFFD9D8D3)))
                                Box(Modifier.weight(1f).height(4.dp).background(if (appearance.split) rightColor else Color(0xFFD9D8D3)))
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(0.dp)) {
                                val previews = listOf("Odj." to room.departures, "Příj." to room.arrivals, "Pobyt" to room.stays).filter { it.second.isNotEmpty() }
                                if (previews.isEmpty()) Text(localize("Bez pobytu ve vybraný den"), style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, lineHeight = 10.sp), maxLines = 1)
                                else previews.take(2).forEach { (kind, kindStays) ->
                                    val first = kindStays.first().guest_label ?: localize("Host neuveden")
                                    Text("$kind $first" + if (kindStays.size > 1) " +${kindStays.size - 1}" else "", style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, lineHeight = 10.sp), maxLines = 1)
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            Text(localize(room.housekeeping_status ?: "Neurčen"), Modifier.fillMaxWidth().padding(top = 3.dp), style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, lineHeight = 10.sp), maxLines = 1)
                        }
                    }
                }
                repeat(4 - orderedRooms.chunked(4)[rowIndex].size) { Spacer(Modifier.weight(1f)) }
            }
        }
        } else {
        item {
            FeatureCard(
                title = "Nový zápis",
                subtitle = "Nejvýše 3 fotografie.",
            )
        }
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
                    label = { Text(localize("Nález")) },
                )
                FilterChip(
                    selected = state.draft.mode == HousekeepingCaptureMode.ISSUE,
                    onClick = { viewModel.updateDraft { current -> current.copy(mode = HousekeepingCaptureMode.ISSUE) } },
                    enabled = state.canCreateIssue,
                    label = { Text(localize("Závada")) },
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
                    Text(localize("Vyfotit"))
                }
                OutlinedButton(
                    onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = state.pendingPhotos.size < 3,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(localize("Přidat z galerie"))
                }
                if (state.pendingPhotos.isNotEmpty()) {
                    OutlinedButton(
                        onClick = viewModel::clearPendingPhotos,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(localize("Vyčistit fotografie"))
                    }
                }
                Button(
                    onClick = viewModel::submit,
                    enabled = !state.isSubmitting && state.draft.isValid(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(localize("Odeslat"))
                }
            }
        }
        state.errorMessage?.let { message ->
            item { FeatureCard(title = "Chyba zápisu pokojské", subtitle = message) }
        }
    }

    }

    val selectedRoom = state.rooms.firstOrNull { it.room_id == state.selectedRoomId }
    if (selectedRoom != null) {
        ModalBottomSheet(
            onDismissRequest = { if (!state.isSavingRoom) viewModel.selectRoom(null) },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.SurfaceRaised,
        ) {
            if (state.isSavingRoom) {
                Column(Modifier.fillMaxWidth().height(240.dp).padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    CircularProgressIndicator()
                    Text(localize("Ukládám stav pokoje") + " ${selectedRoom.room_number}. " + localize("Po zápisu se vrátíte na přehled."), style = MaterialTheme.typography.bodyMedium)
                }
            } else if (showStayPanel) {
                LazyColumn(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { OutlinedButton(onClick = { showStayPanel = false }, enabled = !state.isSavingAmenity, modifier = Modifier.fillMaxWidth()) { Text(localize("← Zpět na stav pokoje")) } }
                    item { Text("${localize("Pokoj")} ${selectedRoom.room_number} · ${localize("Pobyty a ikony")}", style = MaterialTheme.typography.titleLarge) }
                    if (state.isSavingAmenity) item { Text(localize("Ukládám ikonu…"), style = MaterialTheme.typography.bodySmall) }
                    state.amenityError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
                    val stays = listOf("Odjezd" to selectedRoom.departures, "Příjezd" to selectedRoom.arrivals, "Pobyt" to selectedRoom.stays)
                    stays.forEach { (label, reservations) -> reservations.forEach { stay ->
                        item { StayDetail(stay = stay, label = label, date = state.selectedDate, localeCode = localeCode) }
                        listOf("dog" to "Pes", "cot" to "Dětská postýlka").forEach { (kind, amenityLabel) ->
                            val amenity = stay.amenities.firstOrNull { it.kind == kind && it.active }
                            item {
                                if (amenity != null) OutlinedButton(
                                    onClick = { viewModel.updateReservationAmenity(stay.reservation_id, kind) },
                                    enabled = state.canWriteRooms && !state.isSavingAmenity,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text("${localize(amenityLabel)}: ${if (amenity.state == "red") localize("Čeká → hotovo") else localize("Hotovo → čeká")}") }
                                else Text("${localize(amenityLabel)}: ${localize("nepožadováno")}", Modifier.padding(horizontal = 8.dp), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        stay.housekeeping_note?.takeIf { it.isNotBlank() }?.let { note ->
                            item { HousekeepingNoteCard(guest = stay.guest_label, note = note) }
                        }
                    } }
                    if (selectedRoom.departures.isEmpty() && selectedRoom.arrivals.isEmpty() && selectedRoom.stays.isEmpty()) item { Text(localize("Ve vybraný den není přiřazen pobyt. Ikony nelze přidat.")) }
                    if (!state.canWriteRooms) item { Text(localize("Aktivní role může přehled pouze číst."), style = MaterialTheme.typography.bodySmall) }
                }
            } else {
                LazyColumn(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Text("${localize("Pokoj")} ${selectedRoom.room_number}", style = MaterialTheme.typography.titleLarge) }
                    item { Text("${if (selectedRoom.occupied) "${selectedRoom.persons} ${localize("Uvnitř teď")}" else localize("Prázdný teď")} · ${localize(operationalLabel(selectedRoom.operational_state))}", style = MaterialTheme.typography.bodySmall) }
                    selectedRoom.departures.forEach { stay -> item { StayDetail(stay = stay, label = "Odjezd", date = state.selectedDate, localeCode = localeCode) } }
                    selectedRoom.arrivals.forEach { stay -> item { StayDetail(stay = stay, label = "Příjezd", date = state.selectedDate, localeCode = localeCode) } }
                    selectedRoom.stays.forEach { stay -> item { StayDetail(stay = stay, label = "Pobyt", date = state.selectedDate, localeCode = localeCode) } }
                    listOf(selectedRoom.departures, selectedRoom.arrivals, selectedRoom.stays).flatten().filter { !it.housekeeping_note.isNullOrBlank() }.forEach { stay -> item { HousekeepingNoteCard(guest = stay.guest_label, note = stay.housekeeping_note.orEmpty()) } }
                    item { Text("${localize("Aktuální stav úklidu:")} ${localize(selectedRoom.housekeeping_status ?: "Neurčen")}", style = MaterialTheme.typography.bodySmall) }
                    state.roomWriteError?.let { error ->
                        item { Text(error, color = MaterialTheme.colorScheme.error) }
                        item { Button(onClick = viewModel::recoverRoomState) { Text(localize("Obnovit stav")) } }
                    }
                    state.amenityError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
                    if (state.canWriteRooms && state.roomWriteError == null) {
                        item { Text(localize("Změnit stav"), style = MaterialTheme.typography.titleMedium) }
                        items(housekeepingStatuses.chunked(2).size) { rowIndex ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                housekeepingStatuses.chunked(2)[rowIndex].forEach { (value, label) ->
                                    Surface(
                                        onClick = { viewModel.updateRoomStatus(value) },
                                        modifier = Modifier.weight(1f).height(56.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)),
                                        shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.surface,
                                    ) { Box(Modifier.fillMaxSize().padding(5.dp), contentAlignment = Alignment.Center) { Text(localize(label), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold) } }
                                }
                            }
                        }
                        item { OutlinedButton(onClick = { showStayPanel = true }, modifier = Modifier.fillMaxWidth()) { Text(localize("Pobyty a ikony")) } }
                    } else item { Text(localize("Aktivní role může přehled pouze číst."), style = MaterialTheme.typography.bodySmall) }
                    item { OutlinedButton(onClick = { viewModel.selectRoom(null) }, modifier = Modifier.fillMaxWidth()) { Text(localize("Zavřít")) } }
                }
            }
        }
    }
}

@Composable
private fun StayDetail(stay: cz.hcasc.kajovohotel.core.network.dto.HousekeepingStayDto, label: String, date: String, localeCode: String) {
    val arrival = runCatching { LocalDate.parse(stay.arrival) }.getOrNull()
    val departure = runCatching { LocalDate.parse(stay.departure) }.getOrNull()
    val current = runCatching { LocalDate.parse(date) }.getOrNull()
    val totalNights = if (arrival != null && departure != null) departure.toEpochDay() - arrival.toEpochDay() else null
    val elapsedNights = if (arrival != null && current != null && totalNights != null) (current.toEpochDay() - arrival.toEpochDay()).coerceIn(0, totalNights) else null
    val country = stay.country_code?.let { Locale.Builder().setRegion(it).build().getDisplayCountry(Locale.forLanguageTag(localeCode)) } ?: stay.country_name ?: localize("Stát neuveden")
    OutlinedCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp)) {
        Column(Modifier.fillMaxWidth().padding(9.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(localize(label), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            Text(stay.guest_label ?: localize("Host neuveden"), style = MaterialTheme.typography.bodySmall)
            Text(country, style = MaterialTheme.typography.labelSmall)
            if (elapsedNights != null && totalNights != null) Text("${localize("Noc pobytu:")} $elapsedNights/$totalNights", style = MaterialTheme.typography.labelSmall)
            Text("${stay.persons} ${localize("osob")}", style = MaterialTheme.typography.labelSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                stay.amenities.filter { it.active }.forEach { amenity -> Text("${localize(if (amenity.kind == "dog") "Pes" else "Dětská postýlka")}: ${if (amenity.state == "red") localize("Čeká") else localize("hotovo")}", style = MaterialTheme.typography.labelSmall) }
            }
        }
    }
}

@Composable
private fun HousekeepingNoteCard(guest: String?, note: String) {
    OutlinedCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(6.dp), colors = androidx.compose.material3.CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.fillMaxWidth().padding(9.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(localize("Poznámka pro pokojskou") + (guest?.let { " · $it" } ?: ""), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            Text(note, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun operationalLabel(state: String): String = when (state) {
    "checkout_departed_dirty", "checkout_departed_clean", "free" -> "VOLNO"
    "checkout_pending", "checkout_pending_clean" -> "OBSAZENO-ODJÍŽDÍ"
    "arrived" -> "OBSAZENO-PŘIJEL"
    "occupied" -> "OBSAZENO-POBYT"
    else -> state.uppercase()
}

internal fun housekeepingToneColor(tone: HousekeepingTileTone): Color = when (tone) {
    HousekeepingTileTone.RED -> Color(0xFFF27A70)
    HousekeepingTileTone.GREEN -> Color(0xFF2D9B49)
    HousekeepingTileTone.LIGHT_GREEN -> Color(0xFF6AE878)
    HousekeepingTileTone.PURPLE -> Color(0xFFEADCF4)
    HousekeepingTileTone.NEUTRAL -> Color(0xFFD9D8D3)
    HousekeepingTileTone.GRAY -> Color(0xFFEEEBE4)
}

private val housekeepingStatuses = listOf(
    "clean" to "Uklizeno",
    "dirty" to "Neuklizeno",
    "stay_no_linen" to "Průběžný úklid",
    "stay_with_linen" to "Průběžný úklid + prádlo",
    "do_not_disturb" to "Nerušenka",
    "technical_issue" to "Technická závada",
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
                    Text(localize("Odebrat fotografii"))
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
    var expanded by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Text(if (selectedRoom.isBlank()) "Vybrat pokoj" else "Pokoj $selectedRoom")
        }
        androidx.compose.material3.DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            housekeepingRooms.forEach { room ->
                androidx.compose.material3.DropdownMenuItem(
                    onClick = { onSelectRoom(room); expanded = false },
                    text = { Text(room) },
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

private fun occupancyLabel(value: String): String = when (value) {
    "departing" -> "Odjezd"
    "arrived" -> "Příjezd"
    "staying" -> "Ubytovaný"
    else -> "Volný"
}
