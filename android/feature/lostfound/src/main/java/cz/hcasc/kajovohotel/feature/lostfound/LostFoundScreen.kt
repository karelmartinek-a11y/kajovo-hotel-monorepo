package cz.hcasc.kajovohotel.feature.lostfound

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.LostFoundItemType
import cz.hcasc.kajovohotel.core.model.LostFoundStatus
import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundDraft
import cz.hcasc.kajovohotel.feature.lostfound.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.lostfound.presentation.LostFoundViewModel
import cz.hcasc.kajovohotel.feature.lostfound.presentation.LostFoundUiState

@Composable
fun LostFoundScreen(viewModel: LostFoundViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(maxItems = 3)) { uris ->
        viewModel.setPendingPhotos(uris.mapNotNull { readBinaryPayload(context, it) })
    }

    LaunchedEffect(Unit) { viewModel.load() }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item { Text(text = "Ztráty a nálezy", style = MaterialTheme.typography.headlineMedium) }
        item {
            FiltersCard(
                state = state,
                onRefresh = viewModel::load,
                onStartCreate = viewModel::startCreate,
                onFiltersChange = viewModel::updateFilters,
            )
        }
        when {
            state.isLoading -> item { FeatureCard(title = "Načítám ztráty a nálezy", subtitle = "Synchronizuji list, filtry a detail.") }
            state.errorMessage != null -> item { FeatureCard(title = "Chyba modulu", subtitle = state.errorMessage ?: "") }
            state.records.isEmpty() -> item { FeatureCard(title = "Žádný záznam", subtitle = "Ve verified user scope není pro tento filtr evidována žádná položka.") }
            else -> {
                item {
                    EditorCard(
                        state = state,
                        onDraftChange = viewModel::updateDraft,
                        onPickPhotos = {
                            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                        onSave = viewModel::save,
                    )
                }
                items(state.records, key = { it.id }) { record ->
                    FeatureCard(
                        title = "${record.category} · ${record.status.label}",
                        subtitle = "${record.location} · ${record.description}",
                        modifier = Modifier.clickable { viewModel.select(record) },
                    )
                }
            }
        }
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
        FeatureCard(title = "Recepční list, filtry a detail", subtitle = "Modul nabízí jen verified non-admin scope: list, detail, create, edit a photo upload do 3 souborů.")
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
            item {
                FilterChip(
                    selected = state.filters.status == LostFoundStatus.CLAIMED,
                    onClick = { onFiltersChange { current -> current.copy(status = if (current.status == LostFoundStatus.CLAIMED) null else LostFoundStatus.CLAIMED) } },
                    label = { Text("Claimed") },
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
private fun EditorCard(
    state: LostFoundUiState,
    onDraftChange: ((LostFoundDraft) -> LostFoundDraft) -> Unit,
    onPickPhotos: () -> Unit,
    onSave: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = state.selected?.let { "Detail #${it.id}" } ?: "Nový záznam",
            subtitle = state.successMessage ?: "Recepce může záznam založit, upravit a doplnit až 3 fotografie.",
        )
        val draft = state.draft
        OutlinedTextField(value = draft.category, onValueChange = { onDraftChange { current -> current.copy(category = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Kategorie") })
        OutlinedTextField(value = draft.description, onValueChange = { onDraftChange { current -> current.copy(description = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Popis") })
        OutlinedTextField(value = draft.location, onValueChange = { onDraftChange { current -> current.copy(location = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Místo") })
        OutlinedTextField(value = draft.eventAt, onValueChange = { onDraftChange { current -> current.copy(eventAt = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Datum události") })
        OutlinedTextField(value = draft.roomNumber, onValueChange = { onDraftChange { current -> current.copy(roomNumber = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Pokoj") })
        OutlinedTextField(value = draft.claimantName, onValueChange = { onDraftChange { current -> current.copy(claimantName = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Přebírající") })
        OutlinedTextField(value = draft.claimantContact, onValueChange = { onDraftChange { current -> current.copy(claimantContact = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Kontakt") })
        OutlinedTextField(value = draft.handoverNote, onValueChange = { onDraftChange { current -> current.copy(handoverNote = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Poznámka k předání") })
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(LostFoundStatus.entries) { status ->
                FilterChip(
                    selected = draft.status == status,
                    onClick = { onDraftChange { current -> current.copy(status = status) } },
                    label = { Text(status.label) },
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Button(onClick = onPickPhotos, modifier = Modifier.fillMaxWidth()) { Text("Vybrat až 3 fotky") }
            Button(onClick = onSave, enabled = !state.isSaving && draft.isValidForSubmit(), modifier = Modifier.fillMaxWidth()) { Text("Uložit záznam") }
        }
        if (state.pendingPhotos.isNotEmpty()) {
            Text(text = "Vybráno ${state.pendingPhotos.size} nové fotografie")
        }
        state.selected?.photos?.take(3)?.forEach { photo ->
            AsyncImage(
                model = photo.thumbUrl,
                contentDescription = "Náhled fotografie",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(KajovoSpacingTokens.S10 * 3),
                contentScale = ContentScale.Crop,
            )
            AsyncImage(
                model = photo.fullUrl,
                contentDescription = "Detail fotografie",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(KajovoSpacingTokens.S10 * 4),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

private fun readBinaryPayload(context: Context, uri: Uri): BinaryPayload? {
    val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
    val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "photo.jpg"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return BinaryPayload(fileName = fileName, mimeType = mimeType, bytes = bytes)
}
