package cz.hcasc.kajovohotel.feature.breakfast

import android.app.DatePickerDialog
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Grass
import androidx.compose.material.icons.outlined.LocalDrink
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Pets
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.breakfastScreenTitle
import cz.hcasc.kajovohotel.feature.breakfast.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.breakfast.domain.serviceStats
import cz.hcasc.kajovohotel.feature.breakfast.presentation.BreakfastUiState
import cz.hcasc.kajovohotel.feature.breakfast.presentation.BreakfastViewModel
import java.time.LocalDate

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
            Text(
                text = activeRole.breakfastScreenTitle(),
                style = MaterialTheme.typography.headlineMedium,
            )
        }
        item {
            BreakfastToolbar(
                state = state,
                onDateChange = viewModel::setServiceDate,
                onRefresh = { date -> viewModel.load(activeRole, date) },
                onPickImport = { pdfLauncher.launch(arrayOf("application/pdf")) },
                onExport = viewModel::triggerExport,
            )
        }
        when {
            state.isLoading -> item { FeatureCard(title = "Načítám snídaně", subtitle = "Probíhá synchronizace listu a denního souhrnu.") }
            state.errorMessage != null -> item { FeatureCard(title = "Chyba modulu snídaní", subtitle = state.errorMessage ?: "") }
            state.orders.isEmpty() -> item { FeatureCard(title = "Žádné objednávky", subtitle = "Pro zvolené datum nejsou evidovány žádné snídaně.") }
            else -> {
                item { BreakfastSummaryCard(state = state) }
                items(state.orders, key = { it.id }) { order ->
                    BreakfastOrderCard(
                        order = order,
                        showCompactLayout = activeRole == PortalRole.BREAKFAST,
                        isSelected = state.selectedOrder?.id == order.id,
                        isSubmitting = state.isSubmitting,
                        onSelect = { viewModel.selectOrder(order) },
                        onMarkServed = { viewModel.markServed(order.id) },
                    )
                }
                if (activeRole == PortalRole.RECEPTION) {
                    item {
                        ManagerEditor(
                            draft = state.draft,
                            isBusy = state.isSubmitting,
                            onDraftChange = viewModel::updateDraft,
                            onSubmit = viewModel::createOrUpdate,
                        )
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
            }
        }
    }
}

@Composable
private fun BreakfastToolbar(
    state: BreakfastUiState,
    onDateChange: (String) -> Unit,
    onRefresh: (String) -> Unit,
    onPickImport: () -> Unit,
    onExport: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        BreakfastDateSelector(
            serviceDate = state.serviceDate,
            onDateChange = onDateChange,
            onRefresh = onRefresh,
        )
        if (state.role == PortalRole.RECEPTION) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Button(onClick = onPickImport, modifier = Modifier.weight(1f)) { Text("Import PDF") }
                Button(onClick = onExport, modifier = Modifier.weight(1f)) { Text("Export PDF") }
            }
        }
        state.exportMessage?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
        state.successMessage?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
    }
}

@Composable
private fun BreakfastDateSelector(
    serviceDate: String,
    onDateChange: (String) -> Unit,
    onRefresh: (String) -> Unit,
) {
    val context = LocalContext.current
    val parsedDate = runCatching { LocalDate.parse(serviceDate) }.getOrElse { LocalDate.now() }
    val datePickerDialog = DatePickerDialog(
        context,
        { _, year, month, day ->
            val picked = LocalDate.of(year, month + 1, day).toString()
            onDateChange(picked)
            onRefresh(picked)
        },
        parsedDate.year,
        parsedDate.monthValue - 1,
        parsedDate.dayOfMonth,
    )
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        Text(text = "Datum výdeje", style = MaterialTheme.typography.labelLarge)
        Row(
            horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
            modifier = Modifier.fillMaxWidth(),
        ) {
            OutlinedTextField(
                value = serviceDate,
                onValueChange = onDateChange,
                modifier = Modifier.weight(1f),
                label = { Text("YYYY-MM-DD") },
                singleLine = true,
                trailingIcon = {
                    IconButton(onClick = { datePickerDialog.show() }) {
                        Icon(imageVector = Icons.Outlined.CalendarToday, contentDescription = "Vybrat datum")
                    }
                },
            )
            Button(onClick = { onRefresh(serviceDate) }) { Text("Načíst") }
        }
    }
}

@Composable
private fun BreakfastSummaryCard(state: BreakfastUiState) {
    val stats = state.orders.serviceStats(state.summary)
    val summaryDate = state.summary?.serviceDate ?: state.serviceDate

    FeatureCard(
        title = "Denní souhrn $summaryDate",
        subtitle = "Snídaně ${stats.totalBreakfasts} · vydáno ${stats.servedBreakfasts} · zbývá ${stats.remainingBreakfasts}\nPokoje ${stats.totalRooms} · vydáno ${stats.servedRooms} · zbývá ${stats.remainingRooms}",
    )
}

@Composable
private fun BreakfastOrderCard(
    order: BreakfastOrder,
    showCompactLayout: Boolean,
    isSelected: Boolean,
    isSubmitting: Boolean,
    onSelect: () -> Unit,
    onMarkServed: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect() },
        shape = RoundedCornerShape(KajovoRadiusTokens.R12),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = order.roomNumber,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                if (!showCompactLayout) {
                    Text(text = order.status.label, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Text(text = order.guestName, style = MaterialTheme.typography.titleMedium)
            Row(
                horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(imageVector = Icons.Outlined.People, contentDescription = "Počet osob")
                Text(text = "${order.guestCount} osob", style = MaterialTheme.typography.bodyMedium)
            }
            DietIcons(
                noMilk = order.noMilk,
                noGluten = order.noGluten,
                noPork = order.noPork,
            )
            Button(
                onClick = onMarkServed,
                enabled = order.status != BreakfastStatus.SERVED && !isSubmitting,
            ) {
                Icon(
                    imageVector = Icons.Outlined.CheckCircle,
                    contentDescription = "Označit jako vydáno",
                )
                Text(
                    text = if (order.status == BreakfastStatus.SERVED) "Vydáno" else "Vydat",
                    modifier = Modifier.padding(start = KajovoSpacingTokens.S2),
                )
            }
        }
    }
}

@Composable
private fun DietIcons(
    noMilk: Boolean,
    noGluten: Boolean,
    noPork: Boolean,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        if (noGluten) {
            DietIconBadge(icon = Icons.Outlined.Grass, label = "Bez lepku")
        }
        if (noMilk) {
            DietIconBadge(icon = Icons.Outlined.LocalDrink, label = "Bez laktózy")
        }
        if (noPork) {
            DietIconBadge(icon = Icons.Outlined.Pets, label = "Bez vepřového")
        }
    }
}

@Composable
private fun DietIconBadge(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.secondaryContainer,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = icon, contentDescription = label, tint = MaterialTheme.colorScheme.onSecondaryContainer)
            Text(text = label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun ManagerEditor(
    draft: BreakfastDraft,
    isBusy: Boolean,
    onDraftChange: ((BreakfastDraft) -> BreakfastDraft) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Recepční create / edit",
            subtitle = "Recepce může založit, upravit, importovat a exportovat záznamy podle auditovaného scope.",
        )
        OutlinedTextField(
            value = draft.serviceDate,
            onValueChange = { onDraftChange { current -> current.copy(serviceDate = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Datum služby") },
        )
        OutlinedTextField(
            value = draft.roomNumber,
            onValueChange = { onDraftChange { current -> current.copy(roomNumber = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Pokoj") },
        )
        OutlinedTextField(
            value = draft.guestName,
            onValueChange = { onDraftChange { current -> current.copy(guestName = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Host") },
        )
        OutlinedTextField(
            value = draft.guestCount,
            onValueChange = { onDraftChange { current -> current.copy(guestCount = it.filter(Char::isDigit)) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Počet hostů") },
        )
        OutlinedTextField(
            value = draft.note,
            onValueChange = { onDraftChange { current -> current.copy(note = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Poznámka") },
        )
        DietIcons(
            noMilk = draft.noMilk,
            noGluten = draft.noGluten,
            noPork = draft.noPork,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            AssistChip(
                onClick = { onDraftChange { current -> current.copy(noGluten = !current.noGluten) } },
                label = { Text("Bez lepku") },
                leadingIcon = { Icon(Icons.Outlined.Grass, contentDescription = null) },
            )
            AssistChip(
                onClick = { onDraftChange { current -> current.copy(noMilk = !current.noMilk) } },
                label = { Text("Bez laktózy") },
                leadingIcon = { Icon(Icons.Outlined.LocalDrink, contentDescription = null) },
            )
            AssistChip(
                onClick = { onDraftChange { current -> current.copy(noPork = !current.noPork) } },
                label = { Text("Bez vepřového") },
                leadingIcon = { Icon(Icons.Outlined.Pets, contentDescription = null) },
            )
        }
        Button(onClick = onSubmit, enabled = !isBusy && draft.isValidForSubmit()) { Text("Uložit objednávku") }
    }
}

@Composable
private fun ImportPreviewCard(
    state: BreakfastUiState,
    onConfirm: (Uri) -> Unit,
) {
    val preview = state.importPreview ?: return
    val confirmLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(onConfirm)
    }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Import náhled ${preview.serviceDate}",
            subtitle = "Položky ${preview.items.size}",
        )
        preview.items.take(5).forEach { item ->
            Text(text = "Pokoj ${item.room} · ${item.count} hosté · ${item.guestName}")
        }
        if (preview.items.size > 5) {
            Text(text = "… a dalších ${preview.items.size - 5} položek")
        }
        Button(
            onClick = { confirmLauncher.launch(arrayOf("application/pdf")) },
            enabled = state.role == PortalRole.RECEPTION && !state.isSubmitting,
        ) {
            Text("Potvrdit import PDF")
        }
        Text(
            text = "Potvrzení znovu vyžádá stejný PDF soubor a uloží import na backendu.",
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
