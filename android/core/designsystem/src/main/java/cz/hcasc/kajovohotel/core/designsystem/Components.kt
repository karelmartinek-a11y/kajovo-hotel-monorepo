package cz.hcasc.kajovohotel.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortalChrome(
    title: String,
    roleLabel: String,
    onProfileClick: () -> Unit,
    onLogoutClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        SignageBadge()
                        Text(text = title, style = MaterialTheme.typography.titleLarge)
                        Text(text = roleLabel, style = MaterialTheme.typography.bodyMedium)
                    }
                },
                actions = {
                    TextButton(onClick = onProfileClick) { Text(text = "Profil") }
                    TextButton(onClick = onLogoutClick) { Text(text = "Odhlásit") }
                },
            )
        },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(KajovoSpacingTokens.S4),
        ) {
            content()
        }
    }
}

@Composable
fun SignageBadge() {
    Box(
        modifier = Modifier
            .background(KajovoColorTokens.SignRed, RoundedCornerShape(KajovoRadiusTokens.R8))
            .padding(horizontal = KajovoSpacingTokens.S4, vertical = KajovoSpacingTokens.S2),
    ) {
        Text(
            text = "KÁJOVO",
            color = KajovoColorTokens.SignWhite,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun FeatureCard(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(KajovoRadiusTokens.R12),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleLarge)
            Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun StatePane(
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SignageBadge()
        Text(text = title, style = MaterialTheme.typography.headlineMedium)
        Text(text = body, style = MaterialTheme.typography.bodyLarge)
        if (actionLabel != null && onAction != null) {
            TextButton(onClick = onAction) { Text(text = actionLabel) }
        }
    }
}

@Composable
fun BulletLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        Text(text = value, style = MaterialTheme.typography.bodyLarge)
    }
}
