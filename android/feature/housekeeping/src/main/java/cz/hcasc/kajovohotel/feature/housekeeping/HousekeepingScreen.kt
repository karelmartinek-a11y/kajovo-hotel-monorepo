package cz.hcasc.kajovohotel.feature.housekeeping

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
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
import cz.hcasc.kajovohotel.core.designsystem.StatePane
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.HousekeepingCaptureMode
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.feature.housekeeping.presentation.HousekeepingViewModel

@Composable
fun HousekeepingScreen(
    role: PortalRole = PortalRole.HOUSEKEEPING,
    permissions: Set<String> = setOf("issues:write", "lost_found:write"),
    viewModel: HousekeepingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(maxItems = 3)) { uris ->
        viewModel.setPendingPhotos(uris.mapNotNull { readBinaryPayload(context, it) })
    }

    LaunchedEffect(role, permissions) {
        viewModel.configure(role, permissions)
    }

    if (state.successReference != null) {
        StatePane(title = "Quick capture uložen", body = "Úspěšně byl odeslán záznam ${state.successReference}.")
        return
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        item { Text(text = "Pokojská quick capture", style = MaterialTheme.typography.headlineMedium) }
        item {
            FeatureCard(
                title = "Závada / nález v jednom formuláři",
                subtitle = "Housekeeping může rychle založit issue nebo lost-found záznam, vybrat pokoj, doplnit krátký popis a až 3 fotky.",
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                FilterChip(
                    selected = state.draft.mode == HousekeepingCaptureMode.ISSUE,
                    onClick = { viewModel.updateDraft { current -> current.copy(mode = HousekeepingCaptureMode.ISSUE) } },
                    enabled = state.canCreateIssue,
                    label = { Text("Závada") },
                )
                FilterChip(
                    selected = state.draft.mode == HousekeepingCaptureMode.LOST_FOUND,
                    onClick = { viewModel.updateDraft { current -> current.copy(mode = HousekeepingCaptureMode.LOST_FOUND) } },
                    enabled = state.canCreateLostFound,
                    label = { Text("Nález") },
                )
            }
        }
        item {
            OutlinedTextField(value = state.draft.roomNumber, onValueChange = { viewModel.updateDraft { current -> current.copy(roomNumber = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Pokoj") })
        }
        item {
            OutlinedTextField(value = state.draft.location, onValueChange = { viewModel.updateDraft { current -> current.copy(location = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Místo") })
        }
        item {
            OutlinedTextField(value = state.draft.description, onValueChange = { viewModel.updateDraft { current -> current.copy(description = it) } }, modifier = Modifier.fillMaxWidth(), label = { Text("Krátký popis") })
        }
        if (state.pendingPhotos.isNotEmpty()) {
            items(state.pendingPhotos) { payload ->
                FeatureCard(title = payload.fileName, subtitle = payload.mimeType)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                Button(
                    onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Vybrat až 3 fotky") }
                Button(
                    onClick = viewModel::submit,
                    enabled = !state.isSubmitting && state.draft.isValid(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Odeslat") }
            }
        }
        state.errorMessage?.let { message ->
            item { FeatureCard(title = "Chyba quick capture", subtitle = message) }
        }
    }
}

private fun readBinaryPayload(context: Context, uri: Uri): BinaryPayload? {
    val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
    val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "capture.jpg"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return BinaryPayload(fileName = fileName, mimeType = mimeType, bytes = bytes)
}
