package cz.hcasc.kajovohotel.feature.inventory

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.InventoryMovementType
import cz.hcasc.kajovohotel.feature.inventory.presentation.InventoryUiState
import cz.hcasc.kajovohotel.feature.inventory.presentation.InventoryViewModel

@Composable
fun InventoryScreen(viewModel: InventoryViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item { Text(text = "Skladové hospodářství", style = MaterialTheme.typography.headlineMedium) }
        when {
            state.isLoading -> item { FeatureCard(title = "Načítám sklad", subtitle = "Načítá se seznam skladových položek.") }
            state.errorMessage != null -> item { FeatureCard(title = "Chyba modulu", subtitle = state.errorMessage ?: "") }
            state.items.isEmpty() -> item { FeatureCard(title = "Žádné položky", subtitle = "Ve skladu zatím nejsou položky.") }
            else -> {
                item { MovementCard(state = state, onSelectItem = viewModel::selectItem, onDraftChange = viewModel::updateDraft, onSubmitMovement = viewModel::submitMovement) }
                items(state.items, key = { it.id }) { item ->
                    FeatureCard(
                        title = item.name,
                        subtitle = "${item.unit} · stav ${item.currentStock} · minimum ${item.minStock}",
                    )
                }
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
) {
    val draft = state.draft

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = "Nový pohyb skladu",
            subtitle = state.successMessage ?: "Stejný proces jako na webu: nahoře zadání pohybu, dole přehled položek.",
        )
        Text(text = "Položka", style = MaterialTheme.typography.labelLarge)
        state.items.forEach { item ->
            TextButton(
                onClick = { onSelectItem(item.id) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(text = if (state.selectedItemId == item.id) "• ${item.name}" else item.name)
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
        Button(onClick = onSubmitMovement, enabled = state.selectedItemId != null && !state.isSaving && draft.isValid()) {
            Text("Potvrdit pohyb")
        }
    }
}
