package cz.hcasc.kajovohotel.feature.reception

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun ReceptionHubScreen(onBreakfastClick: () -> Unit, onLostFoundClick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Recepce", style = MaterialTheme.typography.headlineMedium)
        FeatureCard(
            title = "Snídaně",
            subtitle = "Denní souhrny, seznam objednávek, import PDF a export pro roli recepce.",
            modifier = Modifier.clickable(onClick = onBreakfastClick)
        )
        FeatureCard(
            title = "Ztráty a nálezy",
            subtitle = "Seznam, detail, založení a převzetí předmětů v user scope.",
            modifier = Modifier.clickable(onClick = onLostFoundClick)
        )
    }
}
