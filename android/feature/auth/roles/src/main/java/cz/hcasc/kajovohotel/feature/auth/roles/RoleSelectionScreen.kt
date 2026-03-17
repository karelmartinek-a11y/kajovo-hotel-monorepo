package cz.hcasc.kajovohotel.feature.auth.roles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import cz.hcasc.kajovohotel.core.designsystem.BrandFooter
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.PortalRole

@Composable
fun RoleSelectionScreen(roles: List<PortalRole>, isBusy: Boolean, onConfirm: (PortalRole) -> Unit) {
    var selectedRole by remember(roles) { mutableStateOf(roles.firstOrNull()) }

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Vyber aktivní roli", style = MaterialTheme.typography.headlineMedium)
        FeatureCard(
            title = "Role-driven shell",
            subtitle = "Aplikace zpřístupní jen moduly potvrzené pro zvolenou neadmin roli.",
        )
        roles.forEach { role ->
            Row(modifier = Modifier.fillMaxWidth()) {
                RadioButton(selected = selectedRole == role, onClick = { selectedRole = role })
                Text(text = role.displayName)
            }
        }
        Button(onClick = { selectedRole?.let(onConfirm) }, enabled = !isBusy && selectedRole != null) {
            Text(text = if (isBusy) "Ukládám volbu" else "Potvrdit roli")
        }
        BrandFooter()
    }
}
