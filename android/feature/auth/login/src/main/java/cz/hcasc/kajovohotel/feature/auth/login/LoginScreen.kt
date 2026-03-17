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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.SignageBadge
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun LoginScreen(isBusy: Boolean, errorMessage: String?, onSubmit: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(modifier = Modifier.padding(KajovoSpacingTokens.S4), verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        SignageBadge()
        Text(text = "Přihlášení do hotelového portálu", style = MaterialTheme.typography.headlineMedium)
        FeatureCard(title = "Nativní Android start", subtitle = "Po spuštění aplikace se vždy otevírá přihlášení bez admin scope.")
        OutlinedTextField(value = email, onValueChange = { email = it }, modifier = Modifier.fillMaxWidth(), label = { Text("E-mail") }, singleLine = true)
        OutlinedTextField(value = password, onValueChange = { password = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Heslo") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        if (!errorMessage.isNullOrBlank()) Text(text = errorMessage, color = MaterialTheme.colorScheme.error)
        Button(onClick = { onSubmit(email.trim(), password) }, enabled = !isBusy && email.isNotBlank() && password.isNotBlank()) {
            Text(text = if (isBusy) "Probíhá přihlášení" else "Přihlásit")
        }
    }
}
