package cz.hcasc.kajovohotel.feature.reception

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ReceptionHubScreen(
    onBreakfastClick: () -> Unit,
    onLostFoundClick: () -> Unit,
    onReportsClick: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        listOf(
            "Snídaně" to onBreakfastClick,
            "Ztráty a nálezy" to onLostFoundClick,
            "Hlášení" to onReportsClick,
        ).forEach { (title, action) ->
            FilledTonalButton(onClick = action, modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}
