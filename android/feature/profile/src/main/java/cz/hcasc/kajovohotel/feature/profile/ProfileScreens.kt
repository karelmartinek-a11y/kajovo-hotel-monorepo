package cz.hcasc.kajovohotel.feature.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import cz.hcasc.kajovohotel.core.designsystem.BulletLine
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.AuthProfile

private val phoneRegex = Regex("""^\+[1-9]\d{1,14}$""")

@Composable
fun ProfileScreen(
    profile: AuthProfile?,
    message: String?,
    onSave: (String, String, String, String) -> Unit,
    onChangePasswordClick: () -> Unit,
    onLogoutClick: () -> Unit,
) {
    var firstName by remember(profile?.firstName) { mutableStateOf(profile?.firstName.orEmpty()) }
    var lastName by remember(profile?.lastName) { mutableStateOf(profile?.lastName.orEmpty()) }
    var phone by remember(profile?.phone) { mutableStateOf(profile?.phone.orEmpty()) }
    var note by remember(profile?.note) { mutableStateOf(profile?.note.orEmpty()) }

    val normalizedPhone = normalizePhoneInput(phone)
    val isPhoneValid = normalizedPhone.isNullOrBlank() || phoneRegex.matches(normalizedPhone)

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Můj profil", style = MaterialTheme.typography.headlineMedium)
        profile?.let {
            FeatureCard(
                title = it.fullName,
                subtitle = "Správa kontaktních údajů a provozní poznámky k účtu ${it.email}",
            )
            BulletLine(label = "Role", value = it.roles.joinToString { role -> role.displayName })
        }
        OutlinedTextField(
            value = firstName,
            onValueChange = { firstName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Jméno") },
        )
        OutlinedTextField(
            value = lastName,
            onValueChange = { lastName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Příjmení") },
        )
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = normalizePhoneInput(it).orEmpty() },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Telefon (E.164, volitelný)") },
            supportingText = {
                if (!isPhoneValid) {
                    Text("Telefon musí být ve formátu E.164.")
                } else {
                    Text("Například +420123456789.")
                }
            },
            isError = !isPhoneValid,
            singleLine = true,
        )
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Poznámka") },
            minLines = 3,
        )
        if (!message.isNullOrBlank()) {
            Text(text = message)
        }
        Button(
            onClick = { onSave(firstName.trim(), lastName.trim(), normalizedPhone.orEmpty(), note.trim()) },
            enabled = firstName.isNotBlank() && lastName.isNotBlank() && isPhoneValid,
        ) {
            Text(text = "Uložit profil")
        }
        Button(onClick = onChangePasswordClick) {
            Text(text = "Změnit heslo")
        }
        OutlinedButton(onClick = onLogoutClick) {
            Text(text = "Odhlásit")
        }
    }
}

@Composable
fun ChangePasswordScreen(message: String?, onSubmit: (String, String) -> Unit) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Změna hesla", style = MaterialTheme.typography.headlineMedium)
        FeatureCard(
            title = "Bezpečné obnovení přístupu",
            subtitle = "Po změně hesla se účet znovu ověří a navážete novým přihlášením.",
        )
        OutlinedTextField(
            value = oldPassword,
            onValueChange = { oldPassword = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Stávající heslo") },
            visualTransformation = PasswordVisualTransformation(),
        )
        OutlinedTextField(
            value = newPassword,
            onValueChange = { newPassword = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nové heslo") },
            visualTransformation = PasswordVisualTransformation(),
        )
        if (!message.isNullOrBlank()) {
            Text(text = message)
        }
        Button(
            onClick = { onSubmit(oldPassword, newPassword) },
            enabled = oldPassword.length >= 8 && newPassword.length >= 8,
        ) {
            Text(text = "Potvrdit změnu")
        }
    }
}

@Composable
fun ResetPasswordScreen(
    message: String?,
    onSubmit: (String, String) -> Unit,
    onBackToLogin: () -> Unit,
) {
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    val passwordsMatch = password == confirmPassword

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Dokončení resetu hesla", style = MaterialTheme.typography.headlineMedium)
        FeatureCard(
            title = "Reset z odkazu hotel.hcasc.cz",
            subtitle = "Dokončete reset hesla z odkazu, který vystavil administrátor. Po uložení se přihlásíte novým heslem.",
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nové heslo") },
            visualTransformation = PasswordVisualTransformation(),
        )
        OutlinedTextField(
            value = confirmPassword,
            onValueChange = { confirmPassword = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Potvrzení hesla") },
            visualTransformation = PasswordVisualTransformation(),
        )
        if (!passwordsMatch && confirmPassword.isNotEmpty()) {
            Text(text = "Hesla se neshodují.", color = MaterialTheme.colorScheme.error)
        }
        if (!message.isNullOrBlank()) {
            Text(text = message)
        }
        Button(
            onClick = { onSubmit(password, confirmPassword) },
            enabled = password.length >= 8 && confirmPassword.length >= 8 && passwordsMatch,
        ) {
            Text(text = "Nastavit nové heslo")
        }
        OutlinedButton(onClick = onBackToLogin) {
            Text(text = "Zpět na přihlášení")
        }
    }
}

private fun normalizePhoneInput(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isBlank()) {
        return null
    }
    if (trimmed.startsWith("+")) {
        return trimmed
    }
    if (trimmed.startsWith("00")) {
        return "+${trimmed.drop(2)}"
    }
    if (trimmed.all(Char::isDigit)) {
        return if (trimmed.startsWith("420")) {
            "+$trimmed"
        } else {
            "+420$trimmed"
        }
    }
    return trimmed
}
