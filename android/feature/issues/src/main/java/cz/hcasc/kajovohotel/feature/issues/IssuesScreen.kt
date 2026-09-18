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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.IssuePriority
import cz.hcasc.kajovohotel.core.model.IssueStatus
import cz.hcasc.kajovohotel.feature.issues.domain.IssueDraft
import cz.hcasc.kajovohotel.feature.issues.presentation.IssuesUiState
import cz.hcasc.kajovohotel.feature.issues.presentation.IssuesViewModel

enum class IssuesSection {
    LIST,
    DETAIL,
    CREATE,
    EDIT,
}

@Composable
fun IssuesScreen(
    initialSection: IssuesSection = IssuesSection.LIST,
    selectedIssueId: Int? = null,
    onNavigate: ((IssuesSection, Int?) -> Unit)? = null,
    viewModel: IssuesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var section by remember { mutableStateOf(initialSection) }
    LaunchedEffect(initialSection) {
        section = initialSection
    }
    LaunchedEffect(Unit) {
        viewModel.load()
    }
    LaunchedEffect(initialSection, selectedIssueId, state.issues) {
        when (initialSection) {
            IssuesSection.CREATE -> viewModel.startCreate()
            IssuesSection.DETAIL,
            IssuesSection.EDIT -> {
                selectedIssueId?.let { issueId ->
                    state.issues.firstOrNull { it.id == issueId }?.let(viewModel::select)
                }
            }
            IssuesSection.LIST -> Unit
        }
    }
    LaunchedEffect(state.successMessage, state.selected?.id) {
        if (state.successMessage != null && state.selected != null) {
            if (onNavigate != null) {
                onNavigate(IssuesSection.DETAIL, state.selected?.id)
            } else {
                section = IssuesSection.DETAIL
            }
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item { Text(text = "Závady", style = MaterialTheme.typography.headlineMedium) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = {
                    if (onNavigate != null) onNavigate(IssuesSection.LIST, null) else section = IssuesSection.LIST
                }, modifier = Modifier.weight(1f)) { Text("Seznam") }
                if (state.selected != null) {
                    OutlinedButton(onClick = {
                        state.selected?.id?.let { id -> onNavigate?.invoke(IssuesSection.DETAIL, id) } ?: run { section = IssuesSection.DETAIL }
                    }, modifier = Modifier.weight(1f)) { Text("Detail") }
                    OutlinedButton(onClick = {
                        state.selected?.id?.let { id -> onNavigate?.invoke(IssuesSection.EDIT, id) } ?: run { section = IssuesSection.EDIT }
                    }, modifier = Modifier.weight(1f)) { Text("Upravit") }
                }
                OutlinedButton(onClick = {
                    viewModel.startCreate()
                    if (onNavigate != null) onNavigate(IssuesSection.CREATE, null) else section = IssuesSection.CREATE
                }, modifier = Modifier.weight(1f)) { Text("Nová") }
            }
        }
        item {
            if (section == IssuesSection.LIST) {
                FiltersCard(
                    state = state,
                    onFiltersChange = viewModel::updateFilters,
                    onRefresh = viewModel::load,
                    onStartCreate = {
                        viewModel.startCreate()
                        if (onNavigate != null) onNavigate(IssuesSection.CREATE, null) else section = IssuesSection.CREATE
                    },
                )
            }
        }
        when {
            state.isLoading -> item {
                FeatureCard(
                    title = "Načítám závady",
                    subtitle = "Připravuji seznam, detail i navazující úpravy pro aktivní roli.",
                )
            }

            state.errorMessage != null -> item {
                FeatureCard(title = "Modul závad není dostupný", subtitle = state.errorMessage ?: "")
            }

            state.issues.isEmpty() -> item {
                FeatureCard(
                    title = "Pro zvolený filtr nejsou žádné závady",
                    subtitle = "Upravte filtr nebo založte nový záznam.",
                )
            }

            else -> {
                if (section == IssuesSection.DETAIL) {
                    item {
                        DetailCard(
                            state = state,
                            onBackToList = {
                                if (onNavigate != null) onNavigate(IssuesSection.LIST, null) else section = IssuesSection.LIST
                            },
                            onMarkResolved = {
                                viewModel.advanceStatus(IssueStatus.RESOLVED)
                            },
                            onStartEdit = {
                                state.selected?.id?.let { id ->
                                    if (onNavigate != null) onNavigate(IssuesSection.EDIT, id) else section = IssuesSection.EDIT
                                }
                            },
                        )
                    }
                }
                if (section == IssuesSection.CREATE || section == IssuesSection.EDIT) {
                    item {
                        EditorCard(
                            state = state,
                            onDraftChange = viewModel::updateDraft,
                            onSave = viewModel::save,
                            onAdvanceStatus = viewModel::advanceStatus,
                            onCancel = {
                                if (state.selected != null) {
                                    val id = state.selected?.id
                                    if (onNavigate != null && id != null) onNavigate(IssuesSection.DETAIL, id) else section = IssuesSection.DETAIL
                                } else if (onNavigate != null) {
                                    onNavigate(IssuesSection.LIST, null)
                                } else {
                                    section = IssuesSection.LIST
                                }
                            },
                        )
                    }
                }
                if (section == IssuesSection.LIST) {
                    items(state.issues, key = { it.id }) { issue ->
                        FeatureCard(
                            title = "${issue.title} · ${issue.status.label}",
                            subtitle = "${issue.location} · priorita ${issue.priority.label}",
                            modifier = Modifier.clickable {
                                viewModel.select(issue)
                                if (onNavigate != null) onNavigate(IssuesSection.DETAIL, issue.id) else section = IssuesSection.DETAIL
                            },
                        )
                        if (issue.status != IssueStatus.RESOLVED && issue.status != IssueStatus.CLOSED) {
                            Button(
                                onClick = {
                                    viewModel.select(issue)
                                    viewModel.advanceStatus(IssueStatus.RESOLVED)
                                },
                                enabled = !state.isSaving,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Označit jako odstraněné")
                            }
                        }
                    }
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
            title = "Přehled závad",
            subtitle = "Filtrujte seznam podle stavu, priority, místa a pokoje, potom otevřete detail nebo rovnou založte nový záznam.",
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
            value = state.filters.location,
            onValueChange = { value -> onFiltersChange { current -> current.copy(location = value) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Místo") },
        )
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
private fun DetailCard(
    state: IssuesUiState,
    onBackToList: () -> Unit,
    onMarkResolved: () -> Unit,
    onStartEdit: () -> Unit,
) {
    val selected = state.selected
    if (selected == null) {
        FeatureCard(
            title = "Vyberte závadu",
            subtitle = "Po výběru se zobrazí detail, časová osa a pod ní formulář pro úpravu.",
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Detail #${selected.id}",
            subtitle = "${selected.status.label} · priorita ${selected.priority.label}",
        )
        Text(text = "Místo: ${selected.location}")
        if (selected.roomNumber.isNotBlank()) {
            Text(text = "Pokoj: ${selected.roomNumber}")
        }
        if (selected.assignee.isNotBlank()) {
            Text(text = "Přiřazeno: ${selected.assignee}")
        }
        if (selected.description.isNotBlank()) {
            Text(text = selected.description)
        }
        val timelineEntries = listOf(
            "Vytvořeno" to selected.createdAt,
            "V řešení" to selected.inProgressAt,
            "Odstraněno" to selected.resolvedAt,
            "Uzavřeno" to selected.closedAt,
            "Aktualizováno" to selected.updatedAt,
        ).filter { (_, value) -> value.isNotBlank() }
        if (timelineEntries.isNotEmpty()) {
            Text(text = "Časová osa")
            timelineEntries.forEach { (label, value) ->
                Text(text = "$label: $value")
            }
        }
        selected.photos.take(3).forEach { photo ->
            AsyncImage(
                model = photo.thumbUrl,
                contentDescription = "Náhled závady",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp),
                contentScale = ContentScale.Crop,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            OutlinedButton(onClick = onBackToList) { Text("Zpět na seznam") }
            if (selected.status != IssueStatus.RESOLVED && selected.status != IssueStatus.CLOSED) {
                OutlinedButton(onClick = onMarkResolved, enabled = !state.isSaving) { Text("Označit jako odstraněné") }
            }
            OutlinedButton(onClick = onStartEdit) { Text("Upravit") }
        }
    }
}

@Composable
private fun EditorCard(
    state: IssuesUiState,
    onDraftChange: ((IssueDraft) -> IssueDraft) -> Unit,
    onSave: () -> Unit,
    onAdvanceStatus: (IssueStatus) -> Unit,
    onCancel: () -> Unit,
) {
    val selected = state.selected
    val draft = state.draft

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = if (state.isEditingExisting) "Upravit závadu #${selected?.id}" else "Nová závada",
            subtitle = state.successMessage ?: "Vyplňte název, místo a popis. Stav můžete měnit jen povolenými přechody.",
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
            value = draft.assignee,
            onValueChange = { onDraftChange { current -> current.copy(assignee = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Přiřazeno") },
        )
        OutlinedTextField(
            value = draft.description,
            onValueChange = { onDraftChange { current -> current.copy(description = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Popis") },
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(IssueStatus.entries) { status ->
                FilterChip(
                    selected = draft.status == status,
                    onClick = { onDraftChange { current -> current.copy(status = status) } },
                    label = { Text(status.label) },
                )
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(IssuePriority.entries) { priority ->
                FilterChip(
                    selected = draft.priority == priority,
                    onClick = { onDraftChange { current -> current.copy(priority = priority) } },
                    label = { Text(priority.label) },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Button(onClick = onSave, enabled = !state.isSaving && draft.isValidForSubmit()) {
                Text(text = if (state.isEditingExisting) "Uložit úpravy" else "Založit závadu")
            }
            OutlinedButton(onClick = onCancel, enabled = !state.isSaving) {
                Text("Zrušit")
            }
        }
        if (state.allowedTransitions.isNotEmpty()) {
            Text(text = "Povolené přechody stavu")
            LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                items(state.allowedTransitions.toList()) { target ->
                    Button(onClick = { onAdvanceStatus(target) }, enabled = !state.isSaving) { Text(target.label) }
                }
            }
        }
    }
}
