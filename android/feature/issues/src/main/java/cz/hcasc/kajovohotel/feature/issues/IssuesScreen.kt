package cz.hcasc.kajovohotel.feature.issues

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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.IssuePriority
import cz.hcasc.kajovohotel.core.model.IssueStatus
import cz.hcasc.kajovohotel.feature.issues.domain.IssueDraft
import cz.hcasc.kajovohotel.feature.issues.presentation.IssuesUiState
import cz.hcasc.kajovohotel.feature.issues.presentation.IssuesViewModel

@Composable
fun IssuesScreen(viewModel: IssuesViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item { Text(text = "Závady", style = MaterialTheme.typography.headlineMedium) }
        item {
            FiltersCard(
                state = state,
                onFiltersChange = viewModel::updateFilters,
                onRefresh = viewModel::load,
                onStartCreate = viewModel::startCreate,
            )
        }
        when {
            state.isLoading -> item { FeatureCard(title = "Načítám závady", subtitle = "Načítá se maintenance list, detail i editace v user-scope portálu.") }
            state.errorMessage != null -> item { FeatureCard(title = "Chyba modulu", subtitle = state.errorMessage ?: "") }
            state.issues.isEmpty() -> item { FeatureCard(title = "Žádné závady", subtitle = "Pro zvolený filtr nejsou dostupné žádné záznamy.") }
            else -> {
                item {
                    EditorCard(
                        state = state,
                        onDraftChange = viewModel::updateDraft,
                        onSave = viewModel::save,
                        onAdvanceStatus = viewModel::advanceStatus,
                    )
                }
                items(state.issues, key = { it.id }) { issue ->
                    FeatureCard(
                        title = "${issue.title} · ${issue.status.label}",
                        subtitle = "${issue.location} · priorita ${issue.priority.label}",
                        modifier = Modifier.clickable { viewModel.select(issue) },
                    )
                }
            }
        }
    }
}

@Composable
private fun FiltersCard(
    state: IssuesUiState,
    onFiltersChange: ((cz.hcasc.kajovohotel.feature.issues.domain.IssueFilters) -> cz.hcasc.kajovohotel.feature.issues.domain.IssueFilters) -> Unit,
    onRefresh: () -> Unit,
    onStartCreate: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Maintenance list + create + edit",
            subtitle = "Role údržba drží stejný user-scope základ jako portál: list, detail, založení, úpravu a posun stavu.",
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(IssueStatus.entries) { status ->
                FilterChip(
                    selected = state.filters.status == status,
                    onClick = { onFiltersChange { current -> current.copy(status = if (current.status == status) null else status) } },
                    label = { Text(status.label) },
                )
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(IssuePriority.entries) { priority ->
                FilterChip(
                    selected = state.filters.priority == priority,
                    onClick = { onFiltersChange { current -> current.copy(priority = if (current.priority == priority) null else priority) } },
                    label = { Text(priority.label) },
                )
            }
        }
        OutlinedTextField(
            value = state.filters.roomNumber,
            onValueChange = { value -> onFiltersChange { current -> current.copy(roomNumber = value) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Pokoj") },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
            Button(onClick = onRefresh) { Text("Použít filtry") }
            OutlinedButton(onClick = onStartCreate) { Text("Nová závada") }
        }
    }
}

@Composable
private fun EditorCard(
    state: IssuesUiState,
    onDraftChange: ((IssueDraft) -> IssueDraft) -> Unit,
    onSave: () -> Unit,
    onAdvanceStatus: (IssueStatus) -> Unit,
) {
    val selected = state.selected
    val draft = state.draft

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = if (state.isEditingExisting) "Detail a úprava #${selected?.id}" else "Nová závada",
            subtitle = state.successMessage ?: "Stejný provozní rozsah jako na portálu hotel.hcasc.cz pro roli údržba.",
        )
        OutlinedTextField(
            value = draft.title,
            onValueChange = { onDraftChange { current -> current.copy(title = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Název závady") },
        )
        OutlinedTextField(
            value = draft.location,
            onValueChange = { onDraftChange { current -> current.copy(location = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Místo") },
        )
        OutlinedTextField(
            value = draft.roomNumber,
            onValueChange = { onDraftChange { current -> current.copy(roomNumber = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Pokoj") },
        )
        OutlinedTextField(
            value = draft.description,
            onValueChange = { onDraftChange { current -> current.copy(description = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Popis") },
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(IssuePriority.entries) { priority ->
                FilterChip(
                    selected = draft.priority == priority,
                    onClick = { onDraftChange { current -> current.copy(priority = priority) } },
                    label = { Text(priority.label) },
                )
            }
        }
        Button(onClick = onSave, enabled = !state.isSaving && draft.isValidForSubmit()) {
            Text(text = if (state.isEditingExisting) "Uložit úpravy" else "Založit závadu")
        }
        if (!selected?.description.isNullOrBlank() && selected != null) {
            Text(text = selected.description)
        }
        if (!selected?.roomNumber.isNullOrBlank() && selected != null) {
            Text(text = "Pokoj ${selected.roomNumber}")
        }
        selected?.photos?.take(3)?.forEach { photo ->
            AsyncImage(
                model = photo.thumbUrl,
                contentDescription = "Náhled závady",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(KajovoSpacingTokens.S10 * 3),
                contentScale = ContentScale.Crop,
            )
        }
        if (state.allowedTransitions.isNotEmpty()) {
            Text(text = "Povolené přechody")
            LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                items(state.allowedTransitions.toList()) { target ->
                    Button(onClick = { onAdvanceStatus(target) }, enabled = !state.isSaving) { Text(target.label) }
                }
            }
        }
    }
}
