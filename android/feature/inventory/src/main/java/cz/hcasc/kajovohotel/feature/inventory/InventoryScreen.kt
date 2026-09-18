package cz.hcasc.kajovohotel.feature.inventory

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import cz.hcasc.kajovohotel.core.common.BinaryPayload
import cz.hcasc.kajovohotel.core.designsystem.R
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.InventoryMovementType
import cz.hcasc.kajovohotel.feature.inventory.domain.InventoryItemDraft
import cz.hcasc.kajovohotel.feature.inventory.presentation.InventoryUiState
import cz.hcasc.kajovohotel.feature.inventory.presentation.InventoryViewModel

enum class InventorySection {
    LIST,
    DETAIL,
    CREATE,
    EDIT,
    MOVEMENT,
}

@Composable
fun InventoryScreen(
    onReportsClick: (() -> Unit)? = null,
    initialSection: InventorySection = InventorySection.LIST,
    selectedItemId: Int? = null,
    onNavigate: ((InventorySection, Int?) -> Unit)? = null,
    viewModel: InventoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var section by remember { mutableStateOf(initialSection) }
    val pictogramPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        viewModel.attachPictogram(uri?.let { readBinaryPayload(context, it) })
    }

    LaunchedEffect(initialSection) {
        section = initialSection
    }
    LaunchedEffect(Unit) {
        viewModel.load()
    }
    LaunchedEffect(initialSection, selectedItemId, state.items) {
        when (initialSection) {
            InventorySection.CREATE -> viewModel.startCreateItem()
            InventorySection.DETAIL,
            InventorySection.EDIT,
            InventorySection.MOVEMENT -> {
                selectedItemId?.let { itemId ->
                    if (state.selectedItemId != itemId) {
                        viewModel.selectItem(itemId)
                    }
                }
            }
            InventorySection.LIST -> Unit
        }
        if (initialSection == InventorySection.EDIT && state.selectedDetail != null && !state.isEditingItem) {
            viewModel.startEditSelected()
        }
    }
    LaunchedEffect(state.successMessage, state.selectedDetail?.id, state.isEditingItem) {
        if (state.successMessage != null && state.selectedDetail != null && !state.isEditingItem) {
            if (onNavigate != null) {
                onNavigate(InventorySection.DETAIL, state.selectedDetail?.id)
            } else {
                section = InventorySection.DETAIL
            }
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        if (section == InventorySection.LIST) item {
            androidx.compose.foundation.layout.Row(
                horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
                modifier = Modifier.fillMaxWidth(),
            ) {
                OutlinedButton(onClick = {
                    if (onNavigate != null) onNavigate(InventorySection.LIST, null) else section = InventorySection.LIST
                }, modifier = Modifier.weight(1f)) { Text("Seznam") }

                OutlinedButton(onClick = {
                    viewModel.startCreateItem()
                    if (onNavigate != null) onNavigate(InventorySection.CREATE, null) else section = InventorySection.CREATE
                }, modifier = Modifier.weight(1f)) { Text("Nová") }
            }
        }
        if (section != InventorySection.LIST && state.errorMessage != null) item {
            Text(state.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
        }
        when {
            state.isLoading -> item {
                FeatureCard(
                    title = "Načítám sklad",
                    subtitle = "",
                )
            }

            state.errorMessage != null && section == InventorySection.LIST -> item {
                FeatureCard(
                    title = "Sklad není dostupný",
                    subtitle = state.errorMessage ?: "",
                )
            }

            state.items.isEmpty() && section == InventorySection.LIST -> item {
                FeatureCard(
                    title = "Ve skladu zatím nejsou položky",
                    subtitle = "",
                )
            }

            else -> {
                if (section == InventorySection.DETAIL) {
                    item {
                        DetailCard(
                            state,
                            onBackToList = {
                                if (onNavigate != null) onNavigate(InventorySection.LIST, null) else section = InventorySection.LIST
                            },
                            onStartEdit = {
                                viewModel.startEditSelected()
                                val id = state.selectedDetail?.id
                                if (onNavigate != null && id != null) onNavigate(InventorySection.EDIT, id) else section = InventorySection.EDIT
                            },
                            onStartMovement = {
                                val id = state.selectedDetail?.id
                                if (onNavigate != null && id != null) onNavigate(InventorySection.MOVEMENT, id) else section = InventorySection.MOVEMENT
                            },
                        )
                    }
                }
                if (section == InventorySection.CREATE || section == InventorySection.EDIT) {
                    item {
                        ItemEditorCard(
                            state = state,
                            onDraftChange = viewModel::updateItemDraft,
                            onSelectPictogram = {
                                pictogramPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            onClearPictogram = { viewModel.attachPictogram(null) },
                            onSave = viewModel::saveItem,
                            onCancel = {
                                if (state.selectedDetail != null) {
                                    val id = state.selectedDetail?.id
                                    if (onNavigate != null && id != null) onNavigate(InventorySection.DETAIL, id) else section = InventorySection.DETAIL
                                } else if (onNavigate != null) {
                                    onNavigate(InventorySection.LIST, null)
                                } else {
                                    section = InventorySection.LIST
                                }
                            },
                        )
                    }
                }
                if (section == InventorySection.MOVEMENT) {
                    item {
                        MovementCard(
                            state = state,
                            onSelectItem = viewModel::selectItem,
                            onDraftChange = viewModel::updateDraft,
                            onSubmitMovement = viewModel::submitMovement,
                            onBackToDetail = {
                                val id = state.selectedDetail?.id ?: state.selectedItemId
                                if (onNavigate != null && id != null) onNavigate(InventorySection.DETAIL, id) else section = InventorySection.DETAIL
                            },
                        )
                    }
                }
                if (section == InventorySection.LIST) {
                    items(state.items, key = { item -> item.id }) { item ->
                        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                            InventoryThumb(
                                thumbPath = item.pictogramThumbPath,
                                fallbackLabel = item.name,
                            )
                            FeatureCard(
                                title = item.name,
                                subtitle = "${item.unit} · stav ${item.currentStock} · minimum ${item.minStock}${if (item.currentStock <= item.minStock) " · pod minimem" else " · OK"}",
                                modifier = Modifier.fillMaxWidth().clickable {
                                    viewModel.selectItem(item.id)
                                    if (onNavigate != null) onNavigate(InventorySection.DETAIL, item.id) else section = InventorySection.DETAIL
                                },
                            )
                        }
                        TextButton(
                            onClick = {
                                viewModel.selectItem(item.id)
                                if (onNavigate != null) onNavigate(InventorySection.DETAIL, item.id) else section = InventorySection.DETAIL
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(text = if (state.selectedItemId == item.id) "Vybráno" else "Otevřít detail")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailCard(
    state: InventoryUiState,
    onBackToList: () -> Unit,
    onStartEdit: () -> Unit,
    onStartMovement: () -> Unit,
) {
    val detail = state.selectedDetail
    if (detail == null) {
        FeatureCard(
            title = "Vyberte skladovou položku",
            subtitle = "",
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = detail.name,
            subtitle = "Veličina ${detail.unit} · minimum ${detail.minStock} · stav ${detail.currentStock}",
        )
        InventoryThumb(
            thumbPath = detail.pictogramThumbPath,
            fallbackLabel = detail.name,
        )
        Text(text = "Hodnota veličiny v 1 ks: ${detail.amountPerPieceBase}")
        if (detail.createdAt.isNotBlank()) {
            Text(text = "Vytvořeno ${detail.createdAt}")
        }
        if (detail.updatedAt.isNotBlank()) {
            Text(text = "Aktualizováno ${detail.updatedAt}")
        }
        if (detail.movements.isNotEmpty()) {
            Text(text = "Historie pohybů")
            detail.movements.forEach { movement ->
                Text(
                    text = "${movement.documentDate} · ${movement.movementType.label} · ${movement.quantity} ${detail.unit}" +
                        if (movement.note.isNotBlank()) " · ${movement.note}" else "",
                )
                if (movement.documentReference.isNotBlank()) {
                    Text(text = "Interní číslo: ${movement.documentReference}")
                }
                if (movement.documentNumber.isNotBlank()) {
                    Text(text = "Číslo dokladu: ${movement.documentNumber}")
                }
                if (movement.createdAt.isNotBlank()) {
                    Text(text = "Založeno: ${movement.createdAt}")
                }
            }
        }
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            OutlinedButton(onClick = onBackToList) { Text("Zpět na seznam") }
            OutlinedButton(onClick = onStartEdit) { Text("Upravit") }
            OutlinedButton(onClick = onStartMovement) { Text("Nový pohyb") }
        }
    }
}

@Composable
private fun ItemEditorCard(
    state: InventoryUiState,
    onDraftChange: ((InventoryItemDraft) -> InventoryItemDraft) -> Unit,
    onSelectPictogram: () -> Unit,
    onClearPictogram: () -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    val draft = state.itemDraft

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        FeatureCard(
            title = if (state.selectedDetail == null) "Nová skladová položka" else "Upravit skladovou položku",
            subtitle = state.successMessage ?: "",
        )
        OutlinedTextField(
            value = draft.name,
            onValueChange = { onDraftChange { current -> current.copy(name = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Název") },
        )
        Text(text = "Veličina v 1 ks", style = MaterialTheme.typography.labelLarge)
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            listOf("g", "l", "ks").forEach { unit ->
                FilterChip(
                    selected = draft.unit == unit,
                    onClick = { onDraftChange { current -> current.copy(unit = unit) } },
                    label = { Text(unit) },
                )
            }
        }
        OutlinedTextField(
            value = draft.amountPerPieceBase,
            onValueChange = { onDraftChange { current -> current.copy(amountPerPieceBase = it.filter(Char::isDigit)) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Hodnota veličiny v 1 ks") },
        )
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        OutlinedTextField(
            value = draft.minStock,
            onValueChange = { onDraftChange { current -> current.copy(minStock = it.filter(Char::isDigit)) } },
            modifier = Modifier.weight(1f),
            label = { Text("Minimální stav") },
        )
        OutlinedTextField(
            value = draft.currentStock,
            onValueChange = { onDraftChange { current -> current.copy(currentStock = it.filter(Char::isDigit)) } },
            modifier = Modifier.weight(1f),
            label = { Text("Aktuální stav") },
        )
        }
        if (state.selectedPictogram != null) {
            Text(text = "Vybraná miniatura: ${state.selectedPictogram.fileName}")
        } else if (state.selectedDetail?.pictogramThumbPath?.isNotBlank() == true) {
            Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                Text(text = "Položka už má uloženou miniaturu.")
                InventoryThumb(
                    thumbPath = state.selectedDetail?.pictogramThumbPath.orEmpty(),
                    fallbackLabel = draft.name,
                )
            }
        }
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            OutlinedButton(onClick = onSelectPictogram) { Text("Vybrat miniaturu") }
            if (state.selectedPictogram != null) {
                OutlinedButton(onClick = onClearPictogram) { Text("Zrušit miniaturu") }
            }
        }
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            Button(onClick = onSave, enabled = !state.isSavingItem && draft.isValid()) {
                Text(if (state.selectedDetail == null) "Založit položku" else "Uložit úpravy")
            }
            OutlinedButton(onClick = onCancel, enabled = !state.isSavingItem) {
                Text("Zrušit")
            }
        }
    }
}

@Composable
private fun MovementCard(
    state: InventoryUiState,
    onSelectItem: (Int) -> Unit,
    onDraftChange: ((cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft) -> cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft) -> Unit,
    onSubmitMovement: () -> Unit,
    onBackToDetail: () -> Unit,
) {
    val draft = state.movementDraft

    var document by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Nový pohyb skladu",
            subtitle = state.successMessage ?: "",
        )
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            FilterChip(selected = !document, onClick = { document = false }, label = { Text("Pohyb") })
            FilterChip(selected = document, onClick = { document = true }, label = { Text("Doklad") })
        }
        if (!document) {
        Text(text = "Položka", style = MaterialTheme.typography.labelLarge)
        var itemMenuOpen by remember { mutableStateOf(false) }
        androidx.compose.foundation.layout.Box {
            OutlinedButton(onClick = { itemMenuOpen = true }, modifier = Modifier.fillMaxWidth()) {
                Text(state.items.firstOrNull { it.id == state.selectedItemId }?.name ?: "Vybrat položku")
            }
            androidx.compose.material3.DropdownMenu(expanded = itemMenuOpen, onDismissRequest = { itemMenuOpen = false }) {
                state.items.forEach { item ->
                    androidx.compose.material3.DropdownMenuItem(text = { Text(item.name) }, onClick = {
                        onSelectItem(item.id)
                        itemMenuOpen = false
                    })
                }
            }
        }
        Text(text = "Druh pohybu", style = MaterialTheme.typography.labelLarge)
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            InventoryMovementType.entries.forEach { type ->
                Button(
                    onClick = { onDraftChange { current -> current.copy(movementType = type) } },
                ) {
                    Text(type.label)
                }
            }
        }
        OutlinedTextField(
            value = draft.quantity,
            onValueChange = { onDraftChange { current -> current.copy(quantity = it.filter(Char::isDigit)) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Množství") },
        )
        } else {
        OutlinedTextField(
            value = draft.documentDate,
            onValueChange = { onDraftChange { current -> current.copy(documentDate = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Datum dokladu") },
        )
        OutlinedTextField(
            value = draft.documentReference,
            onValueChange = { onDraftChange { current -> current.copy(documentReference = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Číslo dokladu (volitelné)") },
        )
        OutlinedTextField(
            value = draft.note,
            onValueChange = { onDraftChange { current -> current.copy(note = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Poznámka (volitelná)") },
        )
        }
        Button(onClick = onSubmitMovement, enabled = state.selectedItemId != null && !state.isSavingMovement && draft.isValid()) {
            Text("Potvrdit pohyb")
        }
        OutlinedButton(onClick = onBackToDetail, enabled = state.selectedItemId != null && !state.isSavingMovement) {
            Text("Zpět na detail")
        }
    }
}

private fun readBinaryPayload(context: Context, uri: Uri): BinaryPayload? {
    val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
    val fileName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameColumn >= 0 && cursor.moveToFirst()) cursor.getString(nameColumn) else null
    } ?: uri.lastPathSegment?.substringAfterLast('/') ?: "inventory-pictogram.jpg"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return BinaryPayload(fileName = fileName, mimeType = mimeType, bytes = bytes)
}

@Composable
private fun InventoryThumb(
    thumbPath: String,
    fallbackLabel: String,
) {
    if (thumbPath.isNotBlank()) {
        AsyncImage(
            model = thumbPath,
            contentDescription = "Miniatura skladové položky",
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp),
            contentScale = ContentScale.Crop,
        )
        return
    }
}
