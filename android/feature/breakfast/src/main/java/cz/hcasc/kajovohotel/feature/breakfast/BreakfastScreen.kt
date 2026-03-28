package cz.hcasc.kajovohotel.feature.breakfast

import android.app.DatePickerDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
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
import androidx.core.content.FileProvider
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.BreakfastStatus
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDietKey
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.BreakfastOrder
import cz.hcasc.kajovohotel.feature.breakfast.domain.applyDraft
import cz.hcasc.kajovohotel.feature.breakfast.domain.breakfastScreenTitle
import cz.hcasc.kajovohotel.feature.breakfast.domain.isValidForSubmit
import cz.hcasc.kajovohotel.feature.breakfast.domain.matchesSearch
import cz.hcasc.kajovohotel.feature.breakfast.domain.serviceStats
import cz.hcasc.kajovohotel.feature.breakfast.presentation.BreakfastUiState
import cz.hcasc.kajovohotel.feature.breakfast.presentation.BreakfastViewModel
import java.io.File
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
    val selectedOrder = state.selectedOrder?.let { order -> order.applyDraft(state.queuedDrafts[order.id]) }
    val visibleOrders = state.orders
        .map { order -> order.applyDraft(state.queuedDrafts[order.id]) }
        .filter { order -> order.matchesSearch(state.searchQuery) }
    val pdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { picked ->
            readBinaryPayload(context, picked)?.let { payload ->
                viewModel.importPreview(payload)
                section = BreakfastSection.IMPORT
            }
        }
    }
    val exportSaveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/pdf"),
    ) { uri ->
        val payload = state.exportFile ?: return@rememberLauncherForActivityResult
        uri?.let { target ->
            if (writeBinaryPayload(context, target, payload)) {
                viewModel.clearExportFile()
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

    LaunchedEffect(state.successMessage, state.importPreview, section, isReceptionMode) {
        if (state.successMessage != null && state.importPreview == null && section == BreakfastSection.IMPORT && isReceptionMode) {
            if (onNavigate != null) {
                onNavigate(BreakfastSection.LIST, null)
            } else {
                section = BreakfastSection.LIST
            }
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
                hasSelection = selectedOrder != null,
                hasImport = state.importPreview != null,
                onShowList = { if (onNavigate != null) onNavigate(BreakfastSection.LIST, null) else section = BreakfastSection.LIST },
                onShowDetail = {
                    val id = selectedOrder?.id
                    if (onNavigate != null && id != null) onNavigate(BreakfastSection.DETAIL, id) else section = BreakfastSection.DETAIL
                },
                onShowCreate = {
                    viewModel.startCreate()
                    if (onNavigate != null) onNavigate(BreakfastSection.CREATE, null) else section = BreakfastSection.CREATE
                },
                onShowEdit = {
                    val id = selectedOrder?.id
                    if (selectedOrder != null) {
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
                onSearchChange = viewModel::setSearchQuery,
                onRefresh = { date -> viewModel.load(activeRole, date) },
                onPickImport = { pdfLauncher.launch(arrayOf("application/pdf")) },
                onExport = viewModel::triggerExport,
                onSaveQueuedDrafts = viewModel::saveQueuedDrafts,
                onDiscardQueuedDrafts = viewModel::discardQueuedDrafts,
                onStartCreate = {
                    viewModel.startCreate()
                    if (onNavigate != null) onNavigate(BreakfastSection.CREATE, null) else section = BreakfastSection.CREATE
                },
            )
        }
        if (isReceptionMode && state.importPreview != null && section == BreakfastSection.IMPORT) {
            item {
                ImportPreviewCard(
                    state = state,
                    onConfirm = viewModel::confirmImport,
                    onToggleDiet = viewModel::toggleImportDiet,
                    onBackToList = { if (onNavigate != null) onNavigate(BreakfastSection.LIST, null) else section = BreakfastSection.LIST },
                )
            }
        }
        state.exportFile?.let { exportFile ->
            item {
                ExportActionsCard(
                    file = exportFile,
                    onOpen = { openBinaryPayload(context, exportFile) },
                    onShare = { shareBinaryPayload(context, exportFile) },
                    onSave = { exportSaveLauncher.launch(exportFile.fileName) },
                    onDismiss = viewModel::clearExportFile,
                )
            }
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

            visibleOrders.isEmpty() -> item {
                FeatureCard(
                    title = "Vyhledávání nenašlo žádnou snídani",
                    subtitle = "Zkuste jiný pokoj nebo jméno hosta.",
                )
            }

            else -> {
                item { BreakfastSummaryCard(state = state) }
                if (isReceptionMode && section == BreakfastSection.DETAIL) {
                    item {
                        ReceptionDetailCard(
                            state = state.copy(selectedOrder = selectedOrder),
                            hasQueuedChanges = selectedOrder?.let { state.queuedDrafts.containsKey(it.id) } == true,
                            onStartCreate = {
                                viewModel.startCreate()
                                if (onNavigate != null) onNavigate(BreakfastSection.CREATE, null) else section = BreakfastSection.CREATE
                            },
                            onStartEdit = {
                                val id = selectedOrder?.id
                                if (selectedOrder != null) {
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
                                if (selectedOrder != null) {
                                    val id = selectedOrder.id
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
                    items(visibleOrders, key = { it.id }) { order ->
                        BreakfastOrderCard(
                            order = order,
                            showCompactLayout = isBreakfastMode,
                            isSelected = !isBreakfastMode && selectedOrder?.id == order.id,
                            isDirty = state.queuedDrafts.containsKey(order.id),
                            isSubmitting = state.isSubmitting,
                            canEditDiet = isReceptionMode,
                            canReturnToPending = isReceptionMode,
                            onSelect = {
                                viewModel.selectOrder(order)
                                if (onNavigate != null) onNavigate(BreakfastSection.DETAIL, order.id) else section = BreakfastSection.DETAIL
                            },
                            onMarkServed = {
                                viewModel.markServed(order.id)
                                if (!isReceptionMode) {
                                    viewModel.saveQueuedDrafts()
                                }
                            },
                            onReturnToPending = { viewModel.returnToPending(order.id) },
                            onToggleDiet = viewModel::toggleQueuedDiet,
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
    onSearchChange: (String) -> Unit,
    onRefresh: (String) -> Unit,
    onPickImport: () -> Unit,
    onExport: () -> Unit,
    onSaveQueuedDrafts: () -> Unit,
    onDiscardQueuedDrafts: () -> Unit,
    onStartCreate: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        BreakfastDateSelector(
            serviceDate = state.serviceDate,
            onDateChange = onDateChange,
            onRefresh = onRefresh,
        )
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onSearchChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Hledat dle pokoje nebo hosta") },
            singleLine = true,
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
                OutlinedButton(
                    onClick = onSaveQueuedDrafts,
                    enabled = state.queuedDrafts.isNotEmpty() && !state.isSubmitting,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (state.queuedDrafts.isEmpty()) "Bez změn" else "Uložit změny (${state.queuedDrafts.size})")
                }
            }
            if (state.queuedDrafts.isNotEmpty()) {
                OutlinedButton(
                    onClick = onDiscardQueuedDrafts,
                    enabled = !state.isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Zahodit rozpracované změny")
                }
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
    hasQueuedChanges: Boolean,
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
        Card(
            shape = RoundedCornerShape(KajovoRadiusTokens.R12),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(
                modifier = Modifier.padding(KajovoSpacingTokens.S4),
                verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
            ) {
                DetailValueRow(label = "Datum služby", value = order.serviceDate)
                DetailValueRow(label = "Pokoj", value = order.roomNumber)
                DetailValueRow(label = "Host", value = order.guestName)
                DetailValueRow(label = "Počet hostů", value = order.guestCount.toString())
                DetailValueRow(label = "Stav", value = order.status.label)
                DetailValueRow(
                    label = "Poznámka",
                    value = order.note.ifBlank { "Bez poznámky" },
                )
                DietIcons(
                    noMilk = order.noMilk,
                    noGluten = order.noGluten,
                    noPork = order.noPork,
                )
                order.createdAt?.let { DetailValueRow(label = "Vytvořeno", value = formatDetailDateTime(it)) }
                order.updatedAt?.let { DetailValueRow(label = "Naposledy upraveno", value = formatDetailDateTime(it)) }
                if (hasQueuedChanges) {
                    Text(
                        text = "Detail obsahuje lokální změny čekající na dávkové uložení.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
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
    isDirty: Boolean,
    isSubmitting: Boolean,
    canEditDiet: Boolean,
    canReturnToPending: Boolean,
    onSelect: () -> Unit,
    onMarkServed: () -> Unit,
    onReturnToPending: () -> Unit,
    onToggleDiet: (Int, BreakfastDietKey) -> Unit,
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
            if (isDirty) {
                Text(text = "Lokální změny čekají na uložení.", style = MaterialTheme.typography.bodyMedium)
            }
            DietIcons(
                noMilk = order.noMilk,
                noGluten = order.noGluten,
                noPork = order.noPork,
                showLabels = !showCompactLayout,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                AssistChip(
                    onClick = { onToggleDiet(order.id, BreakfastDietKey.NO_GLUTEN) },
                    enabled = canEditDiet,
                    label = { Text("Bez lepku") },
                    leadingIcon = { Icon(Icons.Outlined.Grass, contentDescription = null) },
                )
                AssistChip(
                    onClick = { onToggleDiet(order.id, BreakfastDietKey.NO_MILK) },
                    enabled = canEditDiet,
                    label = { Text("Bez laktózy") },
                    leadingIcon = { Icon(Icons.Outlined.LocalDrink, contentDescription = null) },
                )
                AssistChip(
                    onClick = { onToggleDiet(order.id, BreakfastDietKey.NO_PORK) },
                    enabled = canEditDiet,
                    label = { Text("Bez vepřového") },
                    leadingIcon = { Icon(Icons.Outlined.Pets, contentDescription = null) },
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
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
                if (canReturnToPending) {
                    OutlinedButton(
                        onClick = onReturnToPending,
                        enabled = order.status == BreakfastStatus.SERVED && !isSubmitting,
                    ) {
                        Text("Vrátit do čeká")
                    }
                }
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
private fun DetailValueRow(
    label: String,
    value: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = label, style = MaterialTheme.typography.labelMedium)
        Text(text = value, style = MaterialTheme.typography.bodyLarge)
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
        BreakfastStatusSelector(
            selectedStatus = draft.status,
            onSelect = { nextStatus -> onDraftChange { current -> current.copy(status = nextStatus) } },
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
private fun BreakfastStatusSelector(
    selectedStatus: BreakfastStatus,
    onSelect: (BreakfastStatus) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        Text(text = "Stav objednávky", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            BreakfastStatus.entries.forEach { status ->
                AssistChip(
                    onClick = { onSelect(status) },
                    label = { Text(status.label) },
                    enabled = selectedStatus != status,
                )
            }
        }
    }
}

@Composable
private fun ImportPreviewCard(
    state: BreakfastUiState,
    onConfirm: () -> Unit,
    onToggleDiet: (Int, BreakfastDietKey) -> Unit,
    onBackToList: () -> Unit,
) {
    val preview = state.importPreview ?: return
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Kontrola importu ${preview.serviceDate}",
            subtitle = "Soubor ${preview.sourceFileName} obsahuje ${preview.items.size} položek. Po potvrzení se import uloží bez dalšího výběru PDF.",
        )
        preview.items.forEachIndexed { index, item ->
            Card(
                shape = RoundedCornerShape(KajovoRadiusTokens.R12),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(
                    modifier = Modifier.padding(KajovoSpacingTokens.S3),
                    verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
                ) {
                    Text(text = "Pokoj ${item.room} · ${item.count} hosté · ${item.guestName}")
                    Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                        AssistChip(
                            onClick = { onToggleDiet(index, BreakfastDietKey.NO_GLUTEN) },
                            label = { Text("Bez lepku") },
                            leadingIcon = { Icon(Icons.Outlined.Grass, contentDescription = null) },
                        )
                        AssistChip(
                            onClick = { onToggleDiet(index, BreakfastDietKey.NO_MILK) },
                            label = { Text("Bez laktózy") },
                            leadingIcon = { Icon(Icons.Outlined.LocalDrink, contentDescription = null) },
                        )
                        AssistChip(
                            onClick = { onToggleDiet(index, BreakfastDietKey.NO_PORK) },
                            label = { Text("Bez vepřového") },
                            leadingIcon = { Icon(Icons.Outlined.Pets, contentDescription = null) },
                        )
                    }
                    DietIcons(
                        noMilk = item.noMilk,
                        noGluten = item.noGluten,
                        noPork = item.noPork,
                    )
                }
            }
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

@Composable
private fun ExportActionsCard(
    file: BinaryPayload,
    onOpen: () -> Unit,
    onShare: () -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(KajovoRadiusTokens.R12),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
        ) {
            Text(
                text = "Export PDF je připravený",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = file.fileName,
                style = MaterialTheme.typography.bodyMedium,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                Button(onClick = onOpen, modifier = Modifier.weight(1f)) { Text("Otevřít") }
                Button(onClick = onShare, modifier = Modifier.weight(1f)) { Text("Sdílet") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                OutlinedButton(onClick = onSave, modifier = Modifier.weight(1f)) { Text("Uložit jako") }
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Zavřít") }
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

private fun writeBinaryPayload(context: Context, uri: Uri, payload: BinaryPayload): Boolean {
    return runCatching {
        context.contentResolver.openOutputStream(uri)?.use { stream ->
            stream.write(payload.bytes)
            stream.flush()
        } ?: error("Nepodařilo se otevřít cílový soubor.")
    }.isSuccess
}

private fun openBinaryPayload(context: Context, payload: BinaryPayload) {
    val uri = cacheBinaryPayload(context, payload)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, payload.mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    runCatching { context.startActivity(intent) }
        .recoverCatching {
            val chooser = Intent.createChooser(intent, "Otevřít export snídaní").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)
        }
}

private fun shareBinaryPayload(context: Context, payload: BinaryPayload) {
    val uri = cacheBinaryPayload(context, payload)
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = payload.mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TITLE, payload.fileName)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(shareIntent, "Sdílet export snídaní").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(chooser) }
}

private fun cacheBinaryPayload(context: Context, payload: BinaryPayload): Uri {
    val directory = File(context.cacheDir, "breakfast-exports").apply { mkdirs() }
    val file = File(directory, payload.fileName)
    file.writeBytes(payload.bytes)
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

private fun formatDetailDateTime(value: String): String {
    return value.replace('T', ' ').substringBefore('.')
}
