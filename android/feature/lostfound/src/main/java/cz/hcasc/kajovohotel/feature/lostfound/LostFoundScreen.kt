package cz.hcasc.kajovohotel.feature.lostfound

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
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
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.LostFoundItemType
import cz.hcasc.kajovohotel.core.model.LostFoundStatus
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundDraft
import cz.hcasc.kajovohotel.feature.lostfound.domain.defaultLostFoundEventAt
import cz.hcasc.kajovohotel.feature.lostfound.domain.eventAtForPicker
import cz.hcasc.kajovohotel.feature.lostfound.domain.formatLostFoundEventAtForUi
import cz.hcasc.kajovohotel.feature.lostfound.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.lostfound.domain.lostFoundKnownTags
import cz.hcasc.kajovohotel.feature.lostfound.domain.selectedTags
import cz.hcasc.kajovohotel.feature.lostfound.domain.toggleTag
import cz.hcasc.kajovohotel.feature.lostfound.presentation.LostFoundUiState
import cz.hcasc.kajovohotel.feature.lostfound.presentation.LostFoundViewModel
import java.time.LocalDateTime

enum class LostFoundSection {
    LIST,
    DETAIL,
    CREATE,
    EDIT,
}

@Composable
fun LostFoundScreen(
    activeRole: PortalRole,
    initialSection: LostFoundSection = LostFoundSection.LIST,
    selectedRecordId: Int? = null,
    onNavigate: ((LostFoundSection, Int?) -> Unit)? = null,
    viewModel: LostFoundViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var section by remember(activeRole, initialSection) { mutableStateOf(initialSection) }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(maxItems = 3)) { uris ->
        viewModel.setPendingPhotos(uris.mapNotNull { readBinaryPayload(context, it) })
    }

    LaunchedEffect(activeRole) {
        viewModel.configure(activeRole)
        viewModel.load()
    }
    LaunchedEffect(initialSection) {
        section = initialSection
    }
    LaunchedEffect(initialSection, selectedRecordId, state.records) {
        when (initialSection) {
            LostFoundSection.CREATE -> viewModel.startCreate()
            LostFoundSection.DETAIL,
            LostFoundSection.EDIT -> viewModel.selectById(selectedRecordId)
            LostFoundSection.LIST -> Unit
        }
    }
    LaunchedEffect(state.successMessage, state.selected?.id) {
        if (state.successMessage != null && state.selected != null) {
            if (onNavigate != null) onNavigate(LostFoundSection.DETAIL, state.selected?.id) else section = LostFoundSection.DETAIL
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item {
            Text(
                text = if (state.isReceptionView) "Nálezy pro recepci" else "Ztráty a nálezy",
                style = MaterialTheme.typography.headlineMedium,
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { if (onNavigate != null) onNavigate(LostFoundSection.LIST, null) else section = LostFoundSection.LIST }, modifier = Modifier.weight(1f)) { Text("Seznam") }
                if (state.selected != null) {
                    OutlinedButton(onClick = {
                        val id = state.selected?.id
                        if (onNavigate != null && id != null) onNavigate(LostFoundSection.DETAIL, id) else section = LostFoundSection.DETAIL
                    }, modifier = Modifier.weight(1f)) { Text("Detail") }
                }
                    OutlinedButton(onClick = {
                        viewModel.startCreate()
                        if (onNavigate != null) onNavigate(LostFoundSection.CREATE, null) else section = LostFoundSection.CREATE
                    }, modifier = Modifier.weight(1f)) { Text("Nový") }
                    if (state.selected != null) {
                        OutlinedButton(onClick = {
                            val id = state.selected?.id
                            if (onNavigate != null && id != null) onNavigate(LostFoundSection.EDIT, id) else section = LostFoundSection.EDIT
                        }, modifier = Modifier.weight(1f)) { Text("Upravit") }
                    }
            }
        }
        when {
            state.isLoading -> item {
                FeatureCard(
                    title = "Načítám záznamy",
                    subtitle = "Připravuji seznam, detail a návazné akce pro zvolený provozní tok.",
                )
            }

            state.errorMessage != null -> item {
                FeatureCard(title = "Modul ztrát a nálezů není dostupný", subtitle = state.errorMessage ?: "")
            }

            state.records.isEmpty() -> item {
                FeatureCard(
                    title = if (state.isReceptionView) "Čekající nálezy" else "Zatím není žádný záznam",
                    subtitle = if (state.isReceptionView) {
                        "Recepce teď nemá žádný nový předmět k převzetí."
                    } else {
                        "Upravte filtry nebo založte nový záznam."
                    },
                )
            }

            else -> {
                if (section == LostFoundSection.LIST && !state.isReceptionView) {
                    item {
                        FiltersCard(
                            state = state,
                            onRefresh = viewModel::load,
                            onStartCreate = {
                                viewModel.startCreate()
                                if (onNavigate != null) onNavigate(LostFoundSection.CREATE, null) else section = LostFoundSection.CREATE
                            },
                            onFiltersChange = viewModel::updateFilters,
                        )
                    }
                }
                if (section == LostFoundSection.DETAIL) {
                    item {
                        if (state.isReceptionView) {
                            ReceptionDetailCard(
                                state = state,
                                onMarkProcessed = { state.selected?.let(viewModel::markProcessed) },
                                onBackToList = { if (onNavigate != null) onNavigate(LostFoundSection.LIST, null) else section = LostFoundSection.LIST },
                            )
                        } else {
                            DetailCard(
                                state = state,
                                onBackToList = { if (onNavigate != null) onNavigate(LostFoundSection.LIST, null) else section = LostFoundSection.LIST },
                                onStartEdit = {
                                    val id = state.selected?.id
                                    if (onNavigate != null && id != null) onNavigate(LostFoundSection.EDIT, id) else section = LostFoundSection.EDIT
                                },
                            )
                        }
                    }
                }
                if (section == LostFoundSection.CREATE || section == LostFoundSection.EDIT) {
                    item {
                        EditorCard(
                            state = state,
                            onDraftChange = viewModel::updateDraft,
                            onPickPhotos = {
                                photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            onSave = viewModel::save,
                            onCancel = {
                                if (state.selected != null) {
                                    val id = state.selected?.id
                                    if (onNavigate != null && id != null) onNavigate(LostFoundSection.DETAIL, id) else section = LostFoundSection.DETAIL
                                } else if (onNavigate != null) {
                                    onNavigate(LostFoundSection.LIST, null)
                                } else {
                                    section = LostFoundSection.LIST
                                }
                            },
                        )
                    }
                }
                if (section == LostFoundSection.LIST) {
                    items(state.records, key = { it.id }) { record ->
                        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                            FeatureCard(
                                title = "${record.category} · ${record.status.label}",
                                subtitle = "${record.location} · ${record.description}",
                                modifier = Modifier.clickable {
                                    viewModel.select(record)
                                    if (onNavigate != null) onNavigate(LostFoundSection.DETAIL, record.id) else section = LostFoundSection.DETAIL
                                },
                            )
                            if (state.isReceptionView) {
                                Button(
                                    onClick = { viewModel.markProcessed(record) },
                                    enabled = !state.isSaving,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text("Označit jako převzaté")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceptionDetailCard(
    state: LostFoundUiState,
    onMarkProcessed: () -> Unit,
    onBackToList: () -> Unit,
) {
    val selected = state.selected ?: run {
        FeatureCard(
            title = "Vyberte nález",
            subtitle = "Klepnutím na řádek otevřete detail a potvrďte převzetí na recepci.",
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Pokoj ${selected.roomNumber.ifBlank { "-" }}",
            subtitle = "${selected.description} · ${selected.category}",
        )
        selected.photos.firstOrNull()?.let { photo ->
            AsyncImage(
                model = photo.thumbUrl,
                contentDescription = "Miniatura nálezu",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
                contentScale = ContentScale.Crop,
            )
        }
        Text(text = "Místo: ${selected.location}")
        Text(text = "Vznik: ${formatLostFoundEventAtForUi(selected.eventAt)}")
        Button(
            onClick = onMarkProcessed,
            enabled = !state.isSaving,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Označit jako převzaté")
        }
        OutlinedButton(onClick = onBackToList, modifier = Modifier.fillMaxWidth()) {
            Text("Zpět na seznam")
        }
        state.successMessage?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
    }
}

@Composable
private fun FiltersCard(
    state: LostFoundUiState,
    onRefresh: () -> Unit,
    onStartCreate: () -> Unit,
    onFiltersChange: ((cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundFilters) -> cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundFilters) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Filtry a seznam",
            subtitle = "Nejprve vyfiltrujte záznamy a otevřete seznam. Detail a editor jsou oddělené kroky stejně jako na webu.",
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            item {
                FilterChip(
                    selected = state.filters.itemType == LostFoundItemType.FOUND,
                    onClick = { onFiltersChange { current -> current.copy(itemType = if (current.itemType == LostFoundItemType.FOUND) null else LostFoundItemType.FOUND) } },
                    label = { Text("Nalezeno") },
                )
            }
            item {
                FilterChip(
                    selected = state.filters.itemType == LostFoundItemType.LOST,
                    onClick = { onFiltersChange { current -> current.copy(itemType = if (current.itemType == LostFoundItemType.LOST) null else LostFoundItemType.LOST) } },
                    label = { Text("Ztraceno") },
                )
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(LostFoundStatus.entries) { status ->
                FilterChip(
                    selected = state.filters.status == status,
                    onClick = { onFiltersChange { current -> current.copy(status = if (current.status == status) null else status) } },
                    label = { Text(status.label) },
                )
            }
        }
        OutlinedTextField(
            value = state.filters.category,
            onValueChange = { value -> onFiltersChange { current -> current.copy(category = value) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Kategorie") },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
            Button(onClick = onRefresh) { Text("Použít filtry") }
            OutlinedButton(onClick = onStartCreate) { Text("Nový záznam") }
        }
    }
}

@Composable
private fun DetailCard(
    state: LostFoundUiState,
    onBackToList: () -> Unit,
    onStartEdit: () -> Unit,
) {
    val selected = state.selected
    if (selected == null) {
        FeatureCard(
            title = "Vyberte záznam",
            subtitle = "Po výběru se zobrazí samostatný detail předmětu. Úprava je oddělený další krok.",
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Detail #${selected.id}",
            subtitle = "${selected.itemType.label} · ${selected.status.label}",
        )
        Text(text = "Kategorie: ${selected.category}")
        Text(text = "Místo: ${selected.location}")
        Text(text = "Událost: ${formatLostFoundEventAtForUi(selected.eventAt)}")
        if (selected.roomNumber.isNotBlank()) {
            Text(text = "Pokoj: ${selected.roomNumber}")
        }
        if (selected.claimantName.isNotBlank()) {
            Text(text = "Přebírající: ${selected.claimantName}")
        }
        if (selected.claimantContact.isNotBlank()) {
            Text(text = "Kontakt: ${selected.claimantContact}")
        }
        if (selected.handoverNote.isNotBlank()) {
            Text(text = "Předávací záznam: ${selected.handoverNote}")
        }
        if (selected.tags.isNotEmpty()) {
            Text(text = "Tagy: ${selected.tags.joinToString()}")
        }
        selected.photos.take(3).forEach { photo ->
            AsyncImage(
                model = photo.thumbUrl,
                contentDescription = "Fotografie nálezu",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp),
                contentScale = ContentScale.Crop,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            OutlinedButton(onClick = onBackToList) { Text("Zpět na seznam") }
            OutlinedButton(onClick = onStartEdit) { Text("Upravit") }
        }
    }
}

@Composable
private fun EditorCard(
    state: LostFoundUiState,
    onDraftChange: ((LostFoundDraft) -> LostFoundDraft) -> Unit,
    onPickPhotos: () -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    val draft = state.draft
    val selectedTags = draft.selectedTags()
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = state.selected?.let { "Upravit záznam #${it.id}" } ?: "Nový záznam",
            subtitle = state.successMessage ?: "Editor záznamu je oddělený od seznamu a detailu stejně jako na webu.",
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(LostFoundItemType.entries) { itemType ->
                FilterChip(
                    selected = draft.itemType == itemType,
                    onClick = { onDraftChange { current -> current.copy(itemType = itemType) } },
                    label = { Text(itemType.label) },
                )
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(LostFoundStatus.entries) { status ->
                FilterChip(
                    selected = draft.status == status,
                    onClick = { onDraftChange { current -> current.copy(status = status) } },
                    label = { Text(status.label) },
                )
            }
        }
        OutlinedTextField(value = draft.category, onValueChange = { onDraftChange { current -> current.copy(category = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Kategorie") })
        OutlinedTextField(value = draft.description, onValueChange = { onDraftChange { current -> current.copy(description = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Popis") })
        OutlinedTextField(value = draft.location, onValueChange = { onDraftChange { current -> current.copy(location = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Místo nálezu nebo ztráty") })
        EventAtPickerField(
            eventAt = draft.eventAt,
            context = context,
            onChange = { value -> onDraftChange { current -> current.copy(eventAt = value) } },
        )
        OutlinedTextField(value = draft.roomNumber, onValueChange = { onDraftChange { current -> current.copy(roomNumber = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Pokoj") })
        OutlinedTextField(value = draft.claimantName, onValueChange = { onDraftChange { current -> current.copy(claimantName = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Jméno přebírajícího") })
        OutlinedTextField(value = draft.claimantContact, onValueChange = { onDraftChange { current -> current.copy(claimantContact = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Kontakt") })
        OutlinedTextField(value = draft.handoverNote, onValueChange = { onDraftChange { current -> current.copy(handoverNote = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Předávací záznam") })
        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Text(text = "Tagy", style = MaterialTheme.typography.labelLarge)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                items(lostFoundKnownTags) { (tag, label) ->
                    FilterChip(
                        selected = tag in selectedTags,
                        onClick = { onDraftChange { current -> current.toggleTag(tag) } },
                        label = { Text(label) },
                    )
                }
            }
            if (selectedTags.isNotEmpty()) {
                Text(text = "Vybráno: ${selectedTags.joinToString()}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Button(onClick = onPickPhotos, modifier = Modifier.fillMaxWidth()) { Text("Vybrat až 3 fotky") }
            Button(onClick = onSave, enabled = !state.isSaving && draft.isValidForSubmit(), modifier = Modifier.fillMaxWidth()) { Text("Uložit záznam") }
            OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) { Text("Zrušit") }
        }
        if (state.pendingPhotos.isNotEmpty()) {
            Text(text = "Vybráno ${state.pendingPhotos.size} nové fotografie")
        }
    }
}

@Composable
private fun EventAtPickerField(
    eventAt: String,
    context: Context,
    onChange: (String) -> Unit,
) {
    val selectedDateTime = eventAtForPickerSafe(eventAt)
    val openTimePicker = {
        TimePickerDialog(
            context,
            { _, hour, minute ->
                onChange(
                    selectedDateTime
                        .withHour(hour)
                        .withMinute(minute)
                        .withSecond(0)
                        .withNano(0)
                        .toString()
                        .take(16),
                )
            },
            selectedDateTime.hour,
            selectedDateTime.minute,
            true,
        ).show()
    }
    val openDatePicker = {
        DatePickerDialog(
            context,
            { _, year, month, day ->
                val nextDateTime = selectedDateTime
                    .withYear(year)
                    .withMonth(month + 1)
                    .withDayOfMonth(day)
                onChange(nextDateTime.toString().take(16))
                openTimePicker()
            },
            selectedDateTime.year,
            selectedDateTime.monthValue - 1,
            selectedDateTime.dayOfMonth,
        ).show()
    }

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        Text(text = "Datum a čas události", style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = openDatePicker, modifier = Modifier.fillMaxWidth()) {
            Text(formatLostFoundEventAtForUi(eventAt.ifBlank { defaultLostFoundEventAt() }))
        }
    }
}

private fun eventAtForPickerSafe(value: String): LocalDateTime {
    return runCatching { LostFoundDraft(eventAt = value).eventAtForPicker() }
        .getOrElse { LocalDateTime.now() }
}

private fun readBinaryPayload(context: Context, uri: Uri): BinaryPayload? {
    val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
    val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "photo.jpg"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return BinaryPayload(fileName = fileName, mimeType = mimeType, bytes = bytes)
}
