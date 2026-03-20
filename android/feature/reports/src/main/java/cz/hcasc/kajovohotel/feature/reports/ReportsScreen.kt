package cz.hcasc.kajovohotel.feature.reports

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.feature.reports.domain.ReportDraft
import cz.hcasc.kajovohotel.feature.reports.domain.ReportStatus
import cz.hcasc.kajovohotel.feature.reports.presentation.ReportsUiState
import cz.hcasc.kajovohotel.feature.reports.presentation.ReportsViewModel

enum class ReportsSection {
    LIST,
    DETAIL,
    CREATE,
    EDIT,
}

@Composable
fun ReportsScreen(
    canManageReports: Boolean,
    initialSection: ReportsSection = ReportsSection.LIST,
    selectedReportId: Int? = null,
    onNavigate: ((ReportsSection, Int?) -> Unit)? = null,
    viewModel: ReportsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var section by remember { mutableStateOf(initialSection) }
    LaunchedEffect(initialSection) {
        section = initialSection
    }
    LaunchedEffect(Unit) {
        viewModel.load()
    }
    LaunchedEffect(initialSection, selectedReportId, state.reports) {
        when (initialSection) {
            ReportsSection.CREATE -> viewModel.startCreate()
            ReportsSection.DETAIL,
            ReportsSection.EDIT -> {
                selectedReportId?.let { reportId ->
                    state.reports.firstOrNull { it.id == reportId }?.let(viewModel::select)
                }
            }
            ReportsSection.LIST -> Unit
        }
    }
    LaunchedEffect(state.successMessage, state.selected?.id) {
        if (state.successMessage != null && state.selected != null) {
            if (onNavigate != null) {
                onNavigate(ReportsSection.DETAIL, state.selected?.id)
            } else {
                section = ReportsSection.DETAIL
            }
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item { Text(text = "Hlášení", style = MaterialTheme.typography.headlineMedium) }
        item {
            androidx.compose.foundation.layout.Row(
                horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
                modifier = Modifier.fillMaxWidth(),
            ) {
                OutlinedButton(onClick = {
                    if (onNavigate != null) onNavigate(ReportsSection.LIST, null) else section = ReportsSection.LIST
                }, modifier = Modifier.weight(1f)) { Text("Seznam") }
                if (state.selected != null) {
                    OutlinedButton(onClick = {
                        state.selected?.id?.let { id -> onNavigate?.invoke(ReportsSection.DETAIL, id) } ?: run { section = ReportsSection.DETAIL }
                    }, modifier = Modifier.weight(1f)) { Text("Detail") }
                }
                if (canManageReports) {
                    OutlinedButton(onClick = {
                        viewModel.startCreate()
                        if (onNavigate != null) onNavigate(ReportsSection.CREATE, null) else section = ReportsSection.CREATE
                    }, modifier = Modifier.weight(1f)) { Text("Nové") }
                    if (state.selected != null) {
                        OutlinedButton(onClick = {
                            state.selected?.id?.let { id -> onNavigate?.invoke(ReportsSection.EDIT, id) } ?: run { section = ReportsSection.EDIT }
                        }, modifier = Modifier.weight(1f)) { Text("Upravit") }
                    }
                }
            }
        }
        item {
            if (section == ReportsSection.LIST) {
                FiltersCard(
                    state = state,
                        canManageReports = canManageReports,
                        onFiltersChange = viewModel::updateFilters,
                        onRefresh = viewModel::load,
                        onStartCreate = {
                            viewModel.startCreate()
                            if (onNavigate != null) onNavigate(ReportsSection.CREATE, null) else section = ReportsSection.CREATE
                        },
                    )
                }
            }
        when {
            state.isLoading -> item {
                FeatureCard(
                    title = "Načítám hlášení",
                    subtitle = "Připravuji seznam, detail a editor podle oprávnění aktivní role.",
                )
            }

            state.errorMessage != null -> item {
                FeatureCard(title = "Modul hlášení není dostupný", subtitle = state.errorMessage ?: "")
            }

            state.reports.isEmpty() -> item {
                FeatureCard(
                    title = "Zatím není evidováno žádné hlášení",
                    subtitle = if (canManageReports) "Můžete založit první záznam." else "Jakmile vznikne první záznam, objeví se tady.",
                )
            }

            else -> {
                if (section == ReportsSection.DETAIL) {
                    item {
                        DetailCard(
                            state = state,
                            canManageReports = canManageReports,
                            onBackToList = {
                                if (onNavigate != null) onNavigate(ReportsSection.LIST, null) else section = ReportsSection.LIST
                            },
                            onStartEdit = {
                                val id = state.selected?.id
                                if (canManageReports && id != null) {
                                    if (onNavigate != null) onNavigate(ReportsSection.EDIT, id) else section = ReportsSection.EDIT
                                }
                            },
                        )
                    }
                }
                if (section == ReportsSection.CREATE || section == ReportsSection.EDIT) {
                    item {
                        EditorCard(
                            state = state,
                            canManageReports = canManageReports,
                            onDraftChange = viewModel::updateDraft,
                            onSave = viewModel::save,
                            onCancel = {
                                if (state.selected != null) {
                                    val id = state.selected?.id
                                    if (onNavigate != null && id != null) onNavigate(ReportsSection.DETAIL, id) else section = ReportsSection.DETAIL
                                } else if (onNavigate != null) {
                                    onNavigate(ReportsSection.LIST, null)
                                } else {
                                    section = ReportsSection.LIST
                                }
                            },
                        )
                    }
                }
                if (section == ReportsSection.LIST) {
                    items(state.reports, key = { it.id }) { report ->
                        FeatureCard(
                            title = "${report.title} · ${report.status.label}",
                            subtitle = if (report.createdAt.isBlank()) "Otevřít detail" else "Vytvořeno ${report.createdAt}",
                            modifier = Modifier.clickable {
                                viewModel.select(report)
                                if (onNavigate != null) onNavigate(ReportsSection.DETAIL, report.id) else section = ReportsSection.DETAIL
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FiltersCard(
    state: ReportsUiState,
    canManageReports: Boolean,
    onFiltersChange: ((cz.hcasc.kajovohotel.feature.reports.domain.ReportFilters) -> cz.hcasc.kajovohotel.feature.reports.domain.ReportFilters) -> Unit,
    onRefresh: () -> Unit,
    onStartCreate: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Přehled hlášení",
            subtitle = "Filtrujte podle stavu a otevřete detail nebo editor podle oprávnění aktuální role.",
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(ReportStatus.entries) { status ->
                FilterChip(
                    selected = state.filters.status == status,
                    onClick = { onFiltersChange { current -> current.copy(status = if (current.status == status) null else status) } },
                    label = { Text(status.label) },
                )
            }
        }
        if (canManageReports) {
            OutlinedButton(onClick = onStartCreate) { Text("Nové hlášení") }
        }
        OutlinedButton(onClick = onRefresh) { Text("Obnovit") }
    }
}

@Composable
private fun DetailCard(
    state: ReportsUiState,
    canManageReports: Boolean,
    onBackToList: () -> Unit,
    onStartEdit: () -> Unit,
) {
    val selected = state.selected
    if (selected == null) {
        FeatureCard(
            title = "Vyberte hlášení",
            subtitle = "Po výběru se otevře samostatný detail hlášení. Úprava je oddělený další krok.",
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Detail #${selected.id}",
            subtitle = selected.status.label,
        )
        if (selected.description.isNotBlank()) {
            Text(text = selected.description)
        }
        if (selected.createdAt.isNotBlank()) {
            Text(text = "Vytvořeno ${selected.createdAt}")
        }
        if (selected.updatedAt.isNotBlank()) {
            Text(text = "Aktualizováno ${selected.updatedAt}")
        }
        selected.photos.take(3).forEach { photo ->
            AsyncImage(
                model = photo.thumbUrl,
                contentDescription = "Náhled hlášení",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(KajovoSpacingTokens.S10 * 3),
                contentScale = ContentScale.Crop,
            )
        }
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            OutlinedButton(onClick = onBackToList) { Text("Zpět na seznam") }
            if (canManageReports) {
                OutlinedButton(onClick = onStartEdit) { Text("Upravit") }
            }
        }
    }
}

@Composable
private fun EditorCard(
    state: ReportsUiState,
    canManageReports: Boolean,
    onDraftChange: ((ReportDraft) -> ReportDraft) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    val draft = state.draft

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = if (state.isEditingExisting) "Upravit hlášení" else "Nové hlášení",
            subtitle = state.successMessage ?: if (canManageReports) "Vyplňte název, popis a stav hlášení." else "Tato role má přístup jen ke čtení detailu.",
        )
        OutlinedTextField(
            value = draft.title,
            onValueChange = { onDraftChange { current -> current.copy(title = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Název hlášení") },
            enabled = canManageReports,
        )
        OutlinedTextField(
            value = draft.description,
            onValueChange = { onDraftChange { current -> current.copy(description = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Popis") },
            enabled = canManageReports,
            minLines = 3,
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(ReportStatus.entries) { status ->
                FilterChip(
                    selected = draft.status == status,
                    onClick = { onDraftChange { current -> current.copy(status = status) } },
                    label = { Text(status.label) },
                    enabled = canManageReports,
                )
            }
        }
        if (canManageReports) {
            androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                Button(onClick = onSave, enabled = !state.isSaving && draft.isValid()) {
                    Text(text = if (state.isEditingExisting) "Uložit úpravy" else "Založit hlášení")
                }
                OutlinedButton(onClick = onCancel, enabled = !state.isSaving) {
                    Text("Zrušit")
                }
            }
        }
    }
}
