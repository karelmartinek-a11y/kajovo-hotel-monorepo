package cz.hcasc.kajovohotel.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cz.hcasc.kajovohotel.core.designsystem.localize

@Composable
fun ChatScreen(
    initialConversationId: Int? = null,
    onInitialConversationHandled: () -> Unit = {},
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.registerPushToken()
    }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            viewModel.registerPushToken()
        } else {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    LaunchedEffect(initialConversationId, state.conversations, state.loading) {
        val id = initialConversationId ?: return@LaunchedEffect
        if (state.loading) return@LaunchedEffect
        if (viewModel.selectConversation(id) || state.error == null) onInitialConversationHandled()
    }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        val selected = state.selected
        if (selected == null) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(localize("Konverzace"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text("${localize("Nepřečtené")}: ${state.unreadCount}", style = MaterialTheme.typography.labelMedium)
            }
            if (state.loading && state.conversations.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            } else {
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(state.conversations, key = { "conversation-${it.id}" }) { item ->
                        TextButton(onClick = { viewModel.select(item) }, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.fillMaxWidth()) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(item.participant.display_name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                                    if (item.unread_count > 0) Text("${item.unread_count}", color = MaterialTheme.colorScheme.primary)
                                }
                                Text(item.last_message?.body ?: localize("Zatím bez zprávy"), maxLines = 1, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
            Text(localize("Nová konverzace"), style = MaterialTheme.typography.titleMedium)
            LazyColumn(Modifier.weight(0.7f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                items(state.directory, key = { "person-${it.id}" }) { participant ->
                    TextButton(onClick = { viewModel.startConversation(participant) }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth()) {
                            Text(participant.display_name, style = MaterialTheme.typography.bodyMedium)
                            Text(participant.email, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = viewModel::clearSelection) { Text(localize("Zpět")) }
                Text(selected.participant.display_name, style = MaterialTheme.typography.titleMedium)
            }
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                reverseLayout = false,
            ) {
                items(state.messages, key = { "message-${it.id}" }) { message ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (message.is_mine) Arrangement.End else Arrangement.Start) {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = if (message.is_mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth(0.88f),
                        ) {
                            Column(Modifier.padding(10.dp)) {
                                Text(message.body, style = MaterialTheme.typography.bodyMedium)
                                Spacer(Modifier.heightIn(min = 2.dp))
                                Text(message.sent_at, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = state.draft,
                    onValueChange = viewModel::updateDraft,
                    label = { Text(localize("Zpráva")) },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                    supportingText = { Text("${state.draft.length}/4000") },
                )
                Button(onClick = viewModel::send, enabled = state.draft.isNotBlank() && !state.sending) {
                    Text(localize(if (state.sending) "Odesílám…" else "Odeslat"))
                }
            }
        }
    }
}
