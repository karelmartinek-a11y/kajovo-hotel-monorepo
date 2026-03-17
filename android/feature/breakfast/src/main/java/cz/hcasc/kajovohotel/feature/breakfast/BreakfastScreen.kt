package cz.hcasc.kajovohotel.feature.breakfast

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.breakfast.domain.breakfastScreenTitle
import cz.hcasc.kajovohotel.feature.breakfast.presentation.BreakfastViewModel
import cz.hcasc.kajovohotel.feature.breakfast.presentation.BreakfastUiState

@Composable
fun BreakfastScreen(
    activeRole: PortalRole,
    viewModel: BreakfastViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val pdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { picked ->
            readBinaryPayload(context, picked)?.let { payload ->
                viewModel.importPreview(payload)
            }
        }
    }

    LaunchedEffect(activeRole) {
        viewModel.load(activeRole)
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item {
            Text(text = activeRole.breakfastScreenTitle(), style = MaterialTheme.typography.headlineMedium)
        }
        item {
            BreakfastToolbar(
                state = state,
                onDateChange = viewModel::setServiceDate,
                onRefresh = { viewModel.load(activeRole, state.serviceDate) },
                onPickImport = { pdfLauncher.launch(arrayOf("application/pdf")) },
                onExport = viewModel::triggerExport,
            )
        }
        when {
            state.isLoading -> item { FeatureCard(title = "Načítám snídaňová data", subtitle = "Probíhá synchronizace listu a denního souhrnu.") }
            state.errorMessage != null -> item { FeatureCard(title = "Chyba modulu snídaní", subtitle = state.errorMessage ?: "") }
            state.orders.isEmpty() -> item { FeatureCard(title = "Žádné objednávky", subtitle = "Pro zvolené datum nejsou evidovány žádné snídaně.") }
            else -> {
                item { BreakfastSummaryCard(state = state) }
                item {
                    if (activeRole == PortalRole.RECEPTION) {
                        ManagerEditor(
                            draft = state.draft,
                            isBusy = state.isSubmitting,
                            onDraftChange = viewModel::updateDraft,
                            onSubmit = viewModel::createOrUpdate,
                        )
                    } else {
                        ServiceInstructionsCard(state = state, onMarkServed = { state.selectedOrder?.let { viewModel.markServed(it.id) } })
                    }
                }
                if (state.importPreview != null) {
                    item {
                        ImportPreviewCard(
                            state = state,
                            onConfirm = {
                                val file = readBinaryPayload(context, it) ?: return@ImportPreviewCard
                                viewModel.confirmImport(file)
                            },
                        )
                    }
                }
                items(state.orders, key = { it.id }) { order ->
                    FeatureCard(
                        title = "Pokoj ${order.roomNumber} · ${order.guestName}",
                        subtitle = "${order.guestCount} hosté · ${order.status.label}",
                        modifier = Modifier.clickable { viewModel.selectOrder(order) },
                    )
                }
            }
        }
    }
}

@Composable
private fun BreakfastToolbar(
    state: BreakfastUiState,
    onDateChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onPickImport: () -> Unit,
    onExport: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        OutlinedTextField(
            value = state.serviceDate,
            onValueChange = onDateChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Datum služby (YYYY-MM-DD)") },
            singleLine = true,
        )
        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Button(onClick = onRefresh) { Text("Načíst") }
            if (state.role == PortalRole.RECEPTION) {
                Button(onClick = onPickImport) { Text("Import PDF") }
                Button(onClick = onExport) { Text("Export PDF") }
            }
        }
        state.exportMessage?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
        state.successMessage?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
    }
}

@Composable
private fun BreakfastSummaryCard(state: BreakfastUiState) {
    val summary = state.summary
    FeatureCard(
        title = summary?.let { "Denní souhrn ${it.serviceDate}" } ?: "Denní souhrn",
        subtitle = summary?.let { "Objednávky ${it.totalOrders} · hosté ${it.totalGuests} · stavy ${it.statusCounts}" } ?: "Souhrn se načítá.",
    )
}

@Composable
private fun ManagerEditor(
    draft: BreakfastDraft,
    isBusy: Boolean,
    onDraftChange: ((BreakfastDraft) -> BreakfastDraft) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(title = "Recepční create / edit", subtitle = "Recepce může založit, upravit, importovat a exportovat záznamy podle auditovaného scope.")
        OutlinedTextField(value = draft.serviceDate, onValueChange = { onDraftChange { current -> current.copy(serviceDate = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Datum služby") })
        OutlinedTextField(value = draft.roomNumber, onValueChange = { onDraftChange { current -> current.copy(roomNumber = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Pokoj") })
        OutlinedTextField(value = draft.guestName, onValueChange = { onDraftChange { current -> current.copy(guestName = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Host") })
        OutlinedTextField(value = draft.guestCount, onValueChange = { onDraftChange { current -> current.copy(guestCount = it.filter(Char::isDigit)) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Počet hostů") })
        OutlinedTextField(value = draft.note, onValueChange = { onDraftChange { current -> current.copy(note = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Poznámka") })
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
            item { FilterChip(selected = draft.noGluten, onClick = { onDraftChange { current -> current.copy(noGluten = !current.noGluten) } }, label = { Text("Bez lepku") }) }
            item { FilterChip(selected = draft.noMilk, onClick = { onDraftChange { current -> current.copy(noMilk = !current.noMilk) } }, label = { Text("Bez mléka") }) }
            item { FilterChip(selected = draft.noPork, onClick = { onDraftChange { current -> current.copy(noPork = !current.noPork) } }, label = { Text("Bez vepřového") }) }
        }
        Button(onClick = onSubmit, enabled = !isBusy && draft.isValidForSubmit()) { Text("Uložit objednávku") }
    }
}

@Composable
private fun ServiceInstructionsCard(state: BreakfastUiState, onMarkServed: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Servisní režim role snídaně",
            subtitle = "Roli snídaně zůstává list, detail a akce označit jako vydané. Create/edit/import/export se v UI nenabízí.",
        )
        state.selectedOrder?.let { selected ->
            Text(text = "Vybráno: pokoj ${selected.roomNumber} · ${selected.guestName}")
            Button(onClick = onMarkServed, enabled = !state.isSubmitting && selected.status != cz.hcasc.kajovohotel.core.model.BreakfastStatus.SERVED) {
                Text("Označit jako vydané")
            }
        }
    }
}

@Composable
private fun ImportPreviewCard(
    state: BreakfastUiState,
    onConfirm: (Uri) -> Unit,
) {
    val preview = state.importPreview ?: return
    val context = LocalContext.current
    val confirmLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(onConfirm)
    }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Import preview ${preview.serviceDate}",
            subtitle = "Zdroj ${preview.sourceFileName} · položky ${preview.items.size}",
        )
        preview.items.take(5).forEach { item ->
            Text(text = "Pokoj ${item.room} · ${item.count} hosté · ${item.guestName}")
        }
        if (preview.items.size > 5) {
            Text(text = "… a dalších ${preview.items.size - 5} položek")
        }
        Button(onClick = { confirmLauncher.launch(arrayOf("application/pdf")) }, enabled = state.role == PortalRole.RECEPTION && !state.isSubmitting) {
            Text("Potvrdit import PDF")
        }
        Text(
            text = "Potvrzení znovu vyžádá stejný PDF soubor a uloží import na backendu. Tím se drží auditovatelný server-side workflow.",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = KajovoSpacingTokens.S2),
        )
    }
}

private fun readBinaryPayload(context: Context, uri: Uri): BinaryPayload? {
    val contentResolver = context.contentResolver
    val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
    val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "upload.bin"
    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return BinaryPayload(fileName = fileName, mimeType = mimeType, bytes = bytes)
}
