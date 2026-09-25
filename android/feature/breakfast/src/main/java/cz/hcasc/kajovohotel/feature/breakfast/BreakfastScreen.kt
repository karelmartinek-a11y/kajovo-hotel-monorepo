package cz.hcasc.kajovohotel.feature.breakfast

import android.app.DatePickerDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
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
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

enum class BreakfastSection {
    LIST,
    DETAIL,
    CREATE,
    EDIT,
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

    LaunchedEffect(activeRole, state.serviceDate, section, state.queuedDrafts.isEmpty()) {
        if (section == BreakfastSection.LIST && state.queuedDrafts.isEmpty()) {
            while (true) {
                delay(60_000)
                viewModel.load(activeRole, state.serviceDate)
            }
        }
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

    LaunchedEffect(state.successMessage, state.selectedOrder?.id, state.isCreatingNew, isReceptionMode) {
        if (state.isCreatingNew) {
            section = BreakfastSection.CREATE
        } else if (state.selectedOrder != null && state.successMessage != null && isReceptionMode) {
            section = BreakfastSection.DETAIL
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        if (section == BreakfastSection.LIST) item {
            SectionSwitcher(
                section = section,
                isReceptionMode = isReceptionMode,
                hasSelection = selectedOrder != null,
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
            )
        }
        if (section == BreakfastSection.LIST) item {
            BreakfastToolbar(
                state = state,
                onDateChange = viewModel::setServiceDate,
                onSearchChange = viewModel::setSearchQuery,
                onRefresh = { date -> viewModel.load(activeRole, date) },
                onExport = viewModel::triggerExport,
                onSaveQueuedDrafts = viewModel::saveQueuedDrafts,
                onDiscardQueuedDrafts = viewModel::discardQueuedDrafts,
                onStartCreate = {
                    viewModel.startCreate()
                    if (onNavigate != null) onNavigate(BreakfastSection.CREATE, null) else section = BreakfastSection.CREATE
                },
            )
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
        if (section != BreakfastSection.LIST && state.errorMessage != null) item {
            Text(state.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
        }
        when {
            state.isLoading -> item {
                FeatureCard(
                    title = "Načítám snídaně",
                    subtitle = "",
                )
            }

            state.errorMessage != null && section == BreakfastSection.LIST -> item {
                FeatureCard(title = "Modul snídaní není dostupný", subtitle = state.errorMessage ?: "")
            }

            state.orders.isEmpty() && section == BreakfastSection.LIST -> {
                item {
                    FeatureCard(
                        title = "Pro zvolené datum nejsou objednávky",
                        subtitle = if (isReceptionMode) {
                            "Můžete založit první objednávku."
                        } else {
                            "Na vybrané datum není co vydávat."
                        },
                    )
                }
                if (section == BreakfastSection.LIST || isBreakfastMode) {
                    item { BreakfastSummaryCard(state = state) }
                    item { BreakfastRefreshFootnote(sourceImportedAt = state.summary?.sourceImportedAt) }
                }
            }

            visibleOrders.isEmpty() && section == BreakfastSection.LIST -> {
                item {
                    FeatureCard(
                        title = "Vyhledávání nenašlo žádnou snídani",
                        subtitle = "Zkuste jiný pokoj nebo jméno hosta.",
                    )
                }
                if (section == BreakfastSection.LIST || isBreakfastMode) {
                    item { BreakfastSummaryCard(state = state) }
                    item { BreakfastRefreshFootnote(sourceImportedAt = state.summary?.sourceImportedAt) }
                }
            }

            else -> {
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
                                    if (onNavigate != null) onNavigate(BreakfastSection.DETAIL, id) else section = BreakfastSection.DETAIL
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
                    item { BreakfastSummaryCard(state = state) }
                    item { BreakfastRefreshFootnote(sourceImportedAt = state.summary?.sourceImportedAt) }
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
    onShowList: () -> Unit,
    onShowDetail: () -> Unit,
    onShowCreate: () -> Unit,
    onShowEdit: () -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        modifier = Modifier.fillMaxWidth(),
    ) {
        OutlinedButton(onClick = onShowList, modifier = Modifier.weight(1f)) { Text("Seznam") }
        if (isReceptionMode) {
            OutlinedButton(onClick = onShowCreate, modifier = Modifier.weight(1f)) { Text("Nová") }
        }
    }
}

@Composable
private fun BreakfastToolbar(
    state: BreakfastUiState,
    onDateChange: (String) -> Unit,
    onSearchChange: (String) -> Unit,
    onRefresh: (String) -> Unit,
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
                Button(onClick = onExport, modifier = Modifier.weight(1f)) { Text("Export PDF") }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.queuedDrafts.isNotEmpty()) {
                OutlinedButton(
                    onClick = onSaveQueuedDrafts,
                    enabled = state.queuedDrafts.isNotEmpty() && !state.isSubmitting,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Uložit změny (${state.queuedDrafts.size})")
                }
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
    Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2), modifier = Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = { onRefresh(parsedDate.minusDays(1).toString()) }) { Text("‹") }
        OutlinedButton(onClick = { datePickerDialog.show() }, modifier = Modifier.weight(1f)) {
            Icon(Icons.Outlined.CalendarToday, contentDescription = null)
            Text(formatBreakfastHeadlineDate(serviceDate), Modifier.padding(start = 8.dp))
        }
        OutlinedButton(onClick = { onRefresh(parsedDate.plusDays(1).toString()) }) { Text("›") }
        OutlinedButton(onClick = { onRefresh(LocalDate.now().toString()) }) { Text("Dnes") }
    }
}

@Composable
private fun BreakfastSummaryCard(state: BreakfastUiState) {
    val stats = state.orders.serviceStats(state.summary)
    val summaryDate = state.summary?.serviceDate ?: state.serviceDate

    Card(
        shape = RoundedCornerShape(KajovoRadiusTokens.R16),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        ) {
            Text(
                text = "Souhrn pro $summaryDate",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Snídaní celkem: ${stats.totalBreakfasts}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "Vydáno: ${stats.servedBreakfasts}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "Zbývá vydat: ${stats.remainingBreakfasts}",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun BreakfastRefreshFootnote(sourceImportedAt: String?) {
    val importedAt = sourceImportedAt?.let(::formatDetailDateTime) ?: "nenalezeno"
    Text(
        text = "Data aktualizována: $importedAt",
        style = MaterialTheme.typography.labelMedium,
        fontStyle = FontStyle.Italic,
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
            subtitle = "",
        )
        return
    }
    if (state.isCreatingNew) {
        FeatureCard(
            title = "Nová objednávka snídaně",
            subtitle = "",
        )
        return
    }
    order ?: return
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Detail objednávky ${order.roomNumber}",
            subtitle = "",
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
                DetailValueRow(label = "Ubytovaní", value = order.guestNames ?: order.guestName)
                DetailValueRow(label = "Národnost", value = order.countryCode?.let { Locale.Builder().setRegion(it).build().getDisplayCountry(Locale.forLanguageTag("cs")) } ?: "—")
                DetailValueRow(label = "Počet hostů", value = order.guestCount.toString())
                DetailValueRow(label = "Stav", value = order.status.label)
                DetailValueRow(
                    label = "Poznámka",
                    value = order.note.ifBlank { "Bez poznámky" },
                )
                BreakfastDietSummary(
                    noMilk = order.noMilk,
                    noGluten = order.noGluten,
                    noPork = order.noPork,
                )
                order.createdAt?.let { DetailValueRow(label = "Vytvořeno", value = formatDetailDateTime(it)) }
                order.updatedAt?.let { DetailValueRow(label = "Naposledy upraveno", value = formatDetailDateTime(it)) }
                if (hasQueuedChanges) {
                    Text(
                        text = "Neuložené změny",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            OutlinedButton(onClick = onBackToList) { Text("Zpět na seznam") }
            OutlinedButton(onClick = onStartEdit) { Text("Upravit") }
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
            Text(text = order.guestNames ?: order.guestName, style = MaterialTheme.typography.titleMedium)
            Text(text = order.countryCode?.let { Locale.Builder().setRegion(it).build().getDisplayCountry(Locale.forLanguageTag("cs")) } ?: "—", style = MaterialTheme.typography.bodyMedium)
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
                Text(text = "Neuložené změny", style = MaterialTheme.typography.bodyMedium)
            }
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                androidx.compose.material3.FilterChip(
                    selected = order.noGluten,
                    onClick = { onToggleDiet(order.id, BreakfastDietKey.NO_GLUTEN) },
                    enabled = canEditDiet,
                    label = { Text("Bez lepku") },
                    leadingIcon = { Icon(Icons.Outlined.Grass, contentDescription = null) },
                )
                androidx.compose.material3.FilterChip(
                    selected = order.noMilk,
                    onClick = { onToggleDiet(order.id, BreakfastDietKey.NO_MILK) },
                    enabled = canEditDiet,
                    label = { Text("Bez laktózy") },
                    leadingIcon = { Icon(Icons.Outlined.LocalDrink, contentDescription = null) },
                )
                androidx.compose.material3.FilterChip(
                    selected = order.noPork,
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
fun BreakfastDietSummary(
    noMilk: Boolean,
    noGluten: Boolean,
    noPork: Boolean,
    showLabels: Boolean = true,
) {
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        if (noGluten) DietIconBadge(icon = Icons.Outlined.Grass, label = "Bez lepku", showLabel = showLabels)
        if (noMilk) DietIconBadge(icon = Icons.Outlined.LocalDrink, label = "Bez laktózy", showLabel = showLabels)
        if (noPork) DietIconBadge(icon = Icons.Outlined.Pets, label = "Bez vepřového", showLabel = showLabels)
        if (!noGluten && !noMilk && !noPork) Text("Bez diet", style = MaterialTheme.typography.bodyMedium)
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
    cz.hcasc.kajovohotel.core.designsystem.BulletLine(label, value)
}

@Composable
private fun ManagerEditor(
    state: BreakfastUiState,
    onDraftChange: ((BreakfastDraft) -> BreakfastDraft) -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
) {
    val draft = state.draft
    var details by androidx.compose.runtime.saveable.rememberSaveable(state.selectedOrder?.id) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        FeatureCard(
            title = if (state.isCreatingNew || state.selectedOrder == null) "Nová objednávka" else "Upravit vybranou objednávku",
            subtitle = state.successMessage ?: "",
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.FilterChip(selected = !details, onClick = { details = false }, label = { Text("Host") })
            androidx.compose.material3.FilterChip(selected = details, onClick = { details = true }, label = { Text("Stav a diety") })
        }
        if (!details) {
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
        } else {
        BreakfastStatusSelector(
            selectedStatus = draft.status,
            onSelect = { nextStatus -> onDraftChange { current -> current.copy(status = nextStatus) } },
        )
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            androidx.compose.material3.FilterChip(
                selected = draft.noGluten,
                onClick = { onDraftChange { current -> current.copy(noGluten = !current.noGluten) } },
                label = { Text("Bez lepku") },
                leadingIcon = { Icon(Icons.Outlined.Grass, contentDescription = null) },
            )
            androidx.compose.material3.FilterChip(
                selected = draft.noMilk,
                onClick = { onDraftChange { current -> current.copy(noMilk = !current.noMilk) } },
                label = { Text("Bez laktózy") },
                leadingIcon = { Icon(Icons.Outlined.LocalDrink, contentDescription = null) },
            )
            androidx.compose.material3.FilterChip(
                selected = draft.noPork,
                onClick = { onDraftChange { current -> current.copy(noPork = !current.noPork) } },
                label = { Text("Bez vepřového") },
                leadingIcon = { Icon(Icons.Outlined.Pets, contentDescription = null) },
            )
        }
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
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            BreakfastStatus.entries.forEach { status ->
                androidx.compose.material3.FilterChip(
                    selected = selectedStatus == status,
                    onClick = { onSelect(status) },
                    label = { Text(status.label) },
                )
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

private fun formatBreakfastHeadlineDate(value: String): String {
    return runCatching {
        LocalDate.parse(value).format(DateTimeFormatter.ofPattern("EEEE d. MMMM yyyy", Locale.forLanguageTag("cs-CZ")))
    }.getOrElse { value }
}
