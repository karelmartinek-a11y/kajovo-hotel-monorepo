package cz.hcasc.kajovohotel.feature.auth.roles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.unit.dp
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

    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        Text(text = "Vyberte roli", style = MaterialTheme.typography.headlineMedium)
        Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
            roles.forEach { role ->
                Button(
                    onClick = { onConfirm(role) },
                    enabled = !isBusy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(text = if (isBusy) "Ukládám volbu" else role.displayName)
                }
            }
        }
        if (!message.isNullOrBlank()) {
            Text(text = message, color = MaterialTheme.colorScheme.error)
        }
    }
}
