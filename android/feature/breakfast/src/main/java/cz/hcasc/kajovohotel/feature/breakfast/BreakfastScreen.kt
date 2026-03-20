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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
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

enum class BreakfastSection {
    LIST,
    DETAIL,
    CREATE,
    EDIT,
    IMPORT,
}

@Composable
fun BreakfastScreen(
    activeRole: PortalRole,
    initialSection: BreakfastSection = BreakfastSection.LIST,
    selectedOrderId: Int? = null,
    onNavigate: ((BreakfastSection, Int?) -> Unit)? = null,
    viewModel: BreakfastViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val isReceptionMode = activeRole == PortalRole.RECEPTION && state.role == PortalRole.RECEPTION
    val isBreakfastMode = activeRole == PortalRole.BREAKFAST && state.role == PortalRole.BREAKFAST
    val context = LocalContext.current
    var section by remember(activeRole, initialSection) {
        mutableStateOf(initialSection)
    }
    val pdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { picked ->
            readBinaryPayload(context, picked)?.let { payload ->
                viewModel.importPreview(payload)
                section = BreakfastSection.IMPORT
            }
        }
    }

    LaunchedEffect(activeRole) {
        viewModel.load(activeRole)
    }

    LaunchedEffect(initialSection) {
        section = initialSection
    }

    LaunchedEffect(initialSection, selectedOrderId, state.orders) {
        when (initialSection) {
            BreakfastSection.CREATE -> viewModel.startCreate()
            BreakfastSection.DETAIL,
            BreakfastSection.EDIT -> viewModel.selectOrderById(selectedOrderId)
            else -> Unit
        }
    }

    LaunchedEffect(state.successMessage, state.selectedOrder?.id, state.importPreview, state.isCreatingNew) {
        if (state.importPreview != null) {
            section = BreakfastSection.IMPORT
        } else if (state.isCreatingNew) {
            section = BreakfastSection.CREATE
        } else if (state.selectedOrder != null && state.successMessage != null && isReceptionMode) {
            section = BreakfastSection.DETAIL
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item {
            Text(
                text = activeRole.breakfastScreenTitle(),
                style = MaterialTheme.typography.headlineMedium,
            )
        }
        item {
            SectionSwitcher(
                section = section,
                isReceptionMode = isReceptionMode,
                hasSelection = state.selectedOrder != null,
                hasImport = state.importPreview != null,
                onShowList = { if (onNavigate != null) onNavigate(BreakfastSection.LIST, null) else section = BreakfastSection.LIST },
                onShowDetail = {
                    val id = state.selectedOrder?.id
                    if (onNavigate != null && id != null) onNavigate(BreakfastSection.DETAIL, id) else section = BreakfastSection.DETAIL
                },
                onShowCreate = {
                    viewModel.startCreate()
                    if (onNavigate != null) onNavigate(BreakfastSection.CREATE, null) else section = BreakfastSection.CREATE
                },
                onShowEdit = {
                    val id = state.selectedOrder?.id
                    if (state.selectedOrder != null) {
                        if (onNavigate != null && id != null) onNavigate(BreakfastSection.EDIT, id) else section = BreakfastSection.EDIT
                    }
                },
                onShowImport = { if (state.importPreview != null) section = BreakfastSection.IMPORT },
            )
        }
        item {
            BreakfastToolbar(
                state = state,
                onDateChange = viewModel::setServiceDate,
                onRefresh = { date -> viewModel.load(activeRole, date) },
                onPickImport = { pdfLauncher.launch(arrayOf("application/pdf")) },
                onExport = viewModel::triggerExport,
                onStartCreate = {
                    viewModel.startCreate()
                    if (onNavigate != null) onNavigate(BreakfastSection.CREATE, null) else section = BreakfastSection.CREATE
                },
            )
        }
        when {
            state.isLoading -> item {
                FeatureCard(
                    title = "Načítám snídaně",
                    subtitle = "Připravuji seznam objednávek, denní souhrn a návazné akce pro zvolenou roli.",
                )
            }

            state.errorMessage != null -> item {
                FeatureCard(title = "Modul snídaní není dostupný", subtitle = state.errorMessage ?: "")
            }

            state.orders.isEmpty() -> item {
                FeatureCard(
                    title = "Pro zvolené datum nejsou objednávky",
                    subtitle = if (isReceptionMode) {
                        "Můžete založit první objednávku nebo naimportovat PDF."
                    } else {
                        "Na vybrané datum není co vydávat."
                    },
                )
            }

            else -> {
                item { BreakfastSummaryCard(state = state) }
                if (isReceptionMode && section == BreakfastSection.DETAIL) {
                    item {
                        ReceptionDetailCard(
                            state = state,
                            onStartCreate = {
                                viewModel.startCreate()
                                if (onNavigate != null) onNavigate(BreakfastSection.CREATE, null) else section = BreakfastSection.CREATE
                            },
                            onStartEdit = {
                                val id = state.selectedOrder?.id
                                if (state.selectedOrder != null) {
                                    if (onNavigate != null && id != null) onNavigate(BreakfastSection.EDIT, id) else section = BreakfastSection.EDIT
                                }
                            },
                            onBackToList = { if (onNavigate != null) onNavigate(BreakfastSection.LIST, null) else section = BreakfastSection.LIST },
                        )
                    }
                }
                if (isReceptionMode && (section == BreakfastSection.CREATE || section == BreakfastSection.EDIT)) {
                    item {
                        ManagerEditor(
                            state = state,
                            onDraftChange = viewModel::updateDraft,
                            onSubmit = {
                                viewModel.createOrUpdate()
                            },
                            onCancel = {
                                if (state.selectedOrder != null) {
                                    val id = state.selectedOrder?.id
                                    if (onNavigate != null && id != null) onNavigate(BreakfastSection.DETAIL, id) else section = BreakfastSection.DETAIL
                                } else if (onNavigate != null) {
                                    onNavigate(BreakfastSection.LIST, null)
                                } else {
                                    section = BreakfastSection.LIST
                                }
                            },
                        )
                    }
                }
                if (section == BreakfastSection.LIST || isBreakfastMode) {
                    items(state.orders, key = { it.id }) { order ->
                        BreakfastOrderCard(
                            order = order,
                            showCompactLayout = isBreakfastMode,
                            isSelected = !isBreakfastMode && state.selectedOrder?.id == order.id,
                            isSubmitting = state.isSubmitting,
                            onSelect = {
                                viewModel.selectOrder(order)
                                if (onNavigate != null) onNavigate(BreakfastSection.DETAIL, order.id) else section = BreakfastSection.DETAIL
                            },
                            onMarkServed = { viewModel.markServed(order.id) },
                        )
                    }
                }
                if (isReceptionMode && state.importPreview != null && section == BreakfastSection.IMPORT) {
                    item {
                        ImportPreviewCard(
                            state = state,
                            onConfirm = viewModel::confirmImport,
                            onBackToList = { if (onNavigate != null) onNavigate(BreakfastSection.LIST, null) else section = BreakfastSection.LIST },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionSwitcher(
    section: BreakfastSection,
    isReceptionMode: Boolean,
    hasSelection: Boolean,
    hasImport: Boolean,
    onShowList: () -> Unit,
    onShowDetail: () -> Unit,
    onShowCreate: () -> Unit,
    onShowEdit: () -> Unit,
    onShowImport: () -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        modifier = Modifier.fillMaxWidth(),
    ) {
        OutlinedButton(onClick = onShowList, modifier = Modifier.weight(1f)) { Text("Seznam") }
        if (hasSelection) {
            OutlinedButton(onClick = onShowDetail, modifier = Modifier.weight(1f)) { Text("Detail") }
        }
        if (isReceptionMode) {
            OutlinedButton(onClick = onShowCreate, modifier = Modifier.weight(1f)) { Text("Nová") }
            if (hasSelection && section != BreakfastSection.CREATE) {
                OutlinedButton(onClick = onShowEdit, modifier = Modifier.weight(1f)) { Text("Upravit") }
            }
            if (hasImport) {
                OutlinedButton(onClick = onShowImport, modifier = Modifier.weight(1f)) { Text("Import") }
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
    onStartCreate: () -> Unit,
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
            Row(
                horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
                modifier = Modifier.fillMaxWidth(),
            ) {
                OutlinedButton(onClick = onStartCreate, modifier = Modifier.weight(1f)) { Text("Nová objednávka") }
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
private fun ReceptionDetailCard(
    state: BreakfastUiState,
    onStartCreate: () -> Unit,
    onStartEdit: () -> Unit,
    onBackToList: () -> Unit,
) {
    val order = state.selectedOrder
    if (order == null && !state.isCreatingNew) {
        FeatureCard(
            title = "Vyberte objednávku",
            subtitle = "Klepnutím na řádek otevřete detail a následně můžete objednávku upravit.",
        )
        return
    }
    if (state.isCreatingNew) {
        FeatureCard(
            title = "Nová objednávka snídaně",
            subtitle = "Vyplňte formulář níže a založte novou objednávku pro vybrané datum.",
        )
        return
    }
    order ?: return
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Detail objednávky ${order.roomNumber}",
            subtitle = "Host ${order.guestName} · ${order.guestCount} osob · stav ${order.status.label}",
        )
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            OutlinedButton(onClick = onBackToList) { Text("Zpět na seznam") }
            OutlinedButton(onClick = onStartEdit) { Text("Upravit") }
            OutlinedButton(onClick = onStartCreate) { Text("Nová") }
        }
    }
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
    val cardModifier = if (showCompactLayout) {
        Modifier.fillMaxWidth()
    } else {
        Modifier
            .fillMaxWidth()
            .clickable { onSelect() }
    }
    Card(
        modifier = cardModifier,
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
            if (order.note.isNotBlank()) {
                Text(text = order.note, style = MaterialTheme.typography.bodyMedium)
            }
            DietIcons(
                noMilk = order.noMilk,
                noGluten = order.noGluten,
                noPork = order.noPork,
                showLabels = !showCompactLayout,
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
    showLabels: Boolean = true,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        DietIconBadge(icon = Icons.Outlined.Grass, label = "Bez lepku", isActive = noGluten, showLabel = showLabels)
        DietIconBadge(icon = Icons.Outlined.LocalDrink, label = "Bez laktózy", isActive = noMilk, showLabel = showLabels)
        DietIconBadge(icon = Icons.Outlined.Pets, label = "Bez vepřového", isActive = noPork, showLabel = showLabels)
    }
}

@Composable
private fun DietIconBadge(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isActive: Boolean = true,
    showLabel: Boolean = true,
) {
    Surface(
        shape = CircleShape,
        color = if (isActive) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (isActive) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (showLabel) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isActive) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ManagerEditor(
    state: BreakfastUiState,
    onDraftChange: ((BreakfastDraft) -> BreakfastDraft) -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
) {
    val draft = state.draft
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = if (state.isCreatingNew || state.selectedOrder == null) "Nová objednávka" else "Upravit vybranou objednávku",
            subtitle = state.successMessage ?: "Recepce zde pracuje po krocích: nejprve seznam, potom detail a samostatně editor objednávky.",
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
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Button(onClick = onSubmit, enabled = !state.isSubmitting && draft.isValidForSubmit()) {
                Text(if (state.isCreatingNew || state.selectedOrder == null) "Založit objednávku" else "Uložit změny")
            }
            OutlinedButton(onClick = onCancel, enabled = !state.isSubmitting) {
                Text("Zrušit")
            }
        }
    }
}

@Composable
private fun ImportPreviewCard(
    state: BreakfastUiState,
    onConfirm: () -> Unit,
    onBackToList: () -> Unit,
) {
    val preview = state.importPreview ?: return
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Kontrola importu ${preview.serviceDate}",
            subtitle = "Soubor ${preview.sourceFileName} obsahuje ${preview.items.size} položek. Po potvrzení se import uloží bez dalšího výběru PDF.",
        )
        preview.items.take(5).forEach { item ->
            Text(text = "Pokoj ${item.room} · ${item.count} hosté · ${item.guestName}")
        }
        if (preview.items.size > 5) {
            Text(text = "… a dalších ${preview.items.size - 5} položek")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Button(
                onClick = onConfirm,
                enabled = state.role == PortalRole.RECEPTION && !state.isSubmitting,
            ) {
                Text("Potvrdit import PDF")
            }
            OutlinedButton(onClick = onBackToList, enabled = !state.isSubmitting) {
                Text("Zpět na seznam")
            }
        }
    }
}

private fun readBinaryPayload(context: Context, uri: Uri): BinaryPayload? {
    val contentResolver = context.contentResolver
    val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
    val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "upload.bin"
    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return BinaryPayload(fileName = fileName, mimeType = mimeType, bytes = bytes)
}
