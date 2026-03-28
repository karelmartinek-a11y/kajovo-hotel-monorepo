package cz.hcasc.kajovohotel.feature.auth.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
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
import cz.hcasc.kajovohotel.core.designsystem.FullBrandLockup
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun LoginScreen(
    isBusy: Boolean,
    errorMessage: String?,
    onSubmit: (String, String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.padding(KajovoSpacingTokens.S4),
        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        FullBrandLockup()
        Text(
            text = "Vítejte v ${Branding.APP_NAME}",
            style = MaterialTheme.typography.headlineMedium,
        )
        FeatureCard(
            title = "Přihlaste se do provozního portálu",
            subtitle = "Po ověření účtu navážete přesně tam, kde začíná dnešní směna.",
        )
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Uživatelské jméno") },
            singleLine = true,
            enabled = !isBusy,
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Heslo") },
            singleLine = true,
            enabled = !isBusy,
            visualTransformation = PasswordVisualTransformation(),
        )
        Button(
            onClick = { onSubmit(email.trim(), password) },
            enabled = !isBusy && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = if (isBusy) "Probíhá přihlášení" else "Přihlásit")
        }
        Text(
            text = "Reset hesla odesílá pouze administrátor ze správy uživatelů.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Aplikace po spuštění automaticky ověřuje dostupnost nové verze ještě před přihlášením.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!errorMessage.isNullOrBlank()) {
            Text(text = errorMessage, color = MaterialTheme.colorScheme.error)
        }
        BrandFooter()
    }
}
