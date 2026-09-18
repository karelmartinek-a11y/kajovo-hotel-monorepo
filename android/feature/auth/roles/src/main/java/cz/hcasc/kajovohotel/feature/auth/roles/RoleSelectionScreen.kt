package cz.hcasc.kajovohotel.feature.auth.roles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import cz.hcasc.kajovohotel.core.designsystem.BrandFooter
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.PortalRole

@Composable
fun RoleSelectionScreen(
    roles: List<PortalRole>,
    isBusy: Boolean,
    message: String?,
    onConfirm: (PortalRole) -> Unit,
) {
    LaunchedEffect(roles) {
        if (roles.size == 1) {
            roles.firstOrNull()?.let(onConfirm)
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Vyberte roli", style = MaterialTheme.typography.headlineMedium)
        FeatureCard(
            title = "Role a přístup",
            subtitle = "Zobrazují se všechny přiřazené role. Konkrétní obrazovky se povolují až podle aktivní role a aktuálních oprávnění.",
        )
        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
            roles.forEach { role ->
                Button(
                    onClick = { onConfirm(role) },
                    enabled = !isBusy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(text = if (isBusy) "Ukládám volbu" else "Pokračovat jako ${role.displayName}")
                }
            }
        }
        if (!message.isNullOrBlank()) {
            Text(text = message, color = MaterialTheme.colorScheme.error)
        }
        BrandFooter()
    }
}
