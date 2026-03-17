package cz.hcasc.kajovohotel.feature.inventory

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
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
        item { Text(text = "Sklad", style = MaterialTheme.typography.headlineMedium) }
        when {
            state.isLoading -> item { FeatureCard(title = "Načítám sklad", subtitle = "Načítá se seznam i detail skladových položek z user-scope portálu.") }
            state.errorMessage != null -> item { FeatureCard(title = "Chyba modulu", subtitle = state.errorMessage ?: "") }
            state.items.isEmpty() -> item { FeatureCard(title = "Žádné položky", subtitle = "Ve verified non-admin scope není k dispozici žádná položka skladu.") }
            else -> {
                item { DetailCard(state = state, onDraftChange = viewModel::updateDraft, onSubmitMovement = viewModel::submitMovement) }
                items(state.items, key = { it.id }) { item ->
                    FeatureCard(
                        title = item.name,
                        subtitle = "Stav ${item.currentStock} ${item.unit} · minimum ${item.minStock} ${item.unit}",
                        modifier = Modifier.clickable { viewModel.select(item) },
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailCard(
    state: InventoryUiState,
    onDraftChange: ((cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft) -> cz.hcasc.kajovohotel.feature.inventory.domain.InventoryMovementDraft) -> Unit,
    onSubmitMovement: () -> Unit,
) {
    val detail = state.selectedDetail
    val draft = state.draft

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(
            title = detail?.name ?: "Vyberte položku",
            subtitle = state.successMessage
                ?: detail?.let { "Detail skladu dostupný stejně jako na portálu. Stav ${it.currentStock} ${it.unit}." }
                ?: "Načítám detail vybrané položky.",
        )
        if (detail != null) {
            Text(text = "Minimum ${detail.minStock} ${detail.unit} · základ na kus ${detail.amountPerPieceBase}")
            if (detail.movements.isNotEmpty()) {
                Text(text = "Poslední pohyby")
                detail.movements.take(5).forEach { movement ->
                    Text(
                        text = "${movement.documentDate} · ${movement.documentNumber} · ${movement.movementType.label} ${movement.quantity}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
            items(InventoryMovementType.entries) { type ->
                FilterChip(
                    selected = draft.movementType == type,
                    onClick = { onDraftChange { current -> current.copy(movementType = type) } },
                    label = { Text(type.label) },
                )
            }
        }
        OutlinedTextField(
            value = draft.quantity,
            onValueChange = { onDraftChange { current -> current.copy(quantity = it.filter(Char::isDigit)) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Množství") },
        )
        OutlinedTextField(
            value = draft.quantityPieces,
            onValueChange = { onDraftChange { current -> current.copy(quantityPieces = it.filter(Char::isDigit)) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Počet kusů") },
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
            label = { Text("Reference") },
        )
        OutlinedTextField(
            value = draft.note,
            onValueChange = { onDraftChange { current -> current.copy(note = it) } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Poznámka") },
        )
        Button(onClick = onSubmitMovement, enabled = detail != null && !state.isSaving && draft.isValid()) {
            Text("Založit pohyb")
        }
    }
}
