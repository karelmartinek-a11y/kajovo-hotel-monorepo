package cz.hcasc.kajovohotel.feature.reception

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import cz.hcasc.kajovohotel.core.designsystem.BulletLine
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun ReceptionHubScreen(
    onBreakfastClick: () -> Unit,
    onLostFoundClick: () -> Unit,
    onReportsClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Recepce", style = MaterialTheme.typography.headlineMedium)
        Text(
            text = "Vyberte provozní tok, který chcete otevřít. Každá karta vede do plnohodnotného pracovního vstupu, ne jen do stručné zkratky.",
            style = MaterialTheme.typography.bodyMedium,
        )
        ReceptionActionCard(
            title = "Zpracování nálezů",
            subtitle = "Seznam čekajících nálezů, detail položky a převzetí po recepci.",
            points = listOf(
                "Otevře přehled čekajících záznamů.",
                "Zobrazí detail a stav zpracování.",
                "Po potvrzení nález zmizí ze seznamu recepce.",
            ),
            actionLabel = "Otevřít nálezy",
            onAction = onLostFoundClick,
        )
        ReceptionActionCard(
            title = "Import a správa snídaní",
            subtitle = "Denní souhrn, seznam objednávek, detail, založení, úpravy i práce s PDF.",
            points = listOf(
                "Načte denní přehled a rozpracované objednávky.",
                "Umožní otevřít detail i upravit objednávku.",
                "Podporuje import i export PDF pro recepci.",
            ),
            actionLabel = "Otevřít snídaně",
            onAction = onBreakfastClick,
        )
        ReceptionActionCard(
            title = "Přehled hlášení",
            subtitle = "Provozní hlášení s detailem a úpravami dostupnými pro oprávněné role.",
            points = listOf(
                "Zobrazí seznam provozních hlášení.",
                "Otevře detail a úpravu podle oprávnění role.",
                "Drží jednotný tok pro recepci i navazující provoz.",
            ),
            actionLabel = "Otevřít hlášení",
            onAction = onReportsClick,
        )
    }
}

@Composable
private fun ReceptionActionCard(
    title: String,
    subtitle: String,
    points: List<String>,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onAction),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(KajovoRadiusTokens.R12),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleLarge)
            Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
            Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                points.forEachIndexed { index, point ->
                    BulletLine(label = "${index + 1}.", value = point)
                }
            }
            Button(
                onClick = onAction,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(text = actionLabel)
            }
        }
    }
}
