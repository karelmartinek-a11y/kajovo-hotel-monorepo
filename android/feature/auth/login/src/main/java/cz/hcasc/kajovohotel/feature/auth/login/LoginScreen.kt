package cz.hcasc.kajovohotel.feature.auth.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import cz.hcasc.kajovohotel.core.common.Branding
import cz.hcasc.kajovohotel.core.designsystem.BrandFooter
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.SignageBadge
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun LoginScreen(
    isBusy: Boolean,
    errorMessage: String?,
    onSubmit: (String, String, Boolean) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var rememberMe by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(KajovoSpacingTokens.S4),
        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
    ) {
        SignageBadge()
        Text(
            text = "Přihlášení do ${Branding.APP_NAME}",
            style = MaterialTheme.typography.headlineMedium,
        )
        FeatureCard(
            title = "Nativní Android start",
            subtitle = "Po spuštění aplikace se vždy otevře přihlášení bez admin scope.",
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
        ) {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                modifier = Modifier.weight(1f),
                label = { Text("Uživatelské jméno") },
                singleLine = true,
            )
            Button(
                onClick = { onSubmit(email.trim(), password, rememberMe) },
                enabled = !isBusy && email.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.padding(top = KajovoSpacingTokens.S1),
            ) {
                Text(text = if (isBusy) "Probíhá" else "Přihlásit")
            }
        }
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Heslo") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        ) {
            Checkbox(
                checked = rememberMe,
                onCheckedChange = { rememberMe = it },
                enabled = !isBusy,
            )
            Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S1)) {
                Text(
                    text = "Zůstat přihlášený i po zavření aplikace",
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    text = "Pokud volbu zapnete, aplikace může ponechat přihlášení aktivní i několik dnů.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (!errorMessage.isNullOrBlank()) {
            Text(text = errorMessage, color = MaterialTheme.colorScheme.error)
        }
        BrandFooter()
    }
}
