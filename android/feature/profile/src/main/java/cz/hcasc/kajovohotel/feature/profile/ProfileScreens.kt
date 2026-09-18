package cz.hcasc.kajovohotel.feature.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.ui.unit.dp
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
import cz.hcasc.kajovohotel.core.designsystem.AdaptiveTwoColumnBlock
import cz.hcasc.kajovohotel.core.designsystem.BulletLine
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.KajovoDeviceLayout
import cz.hcasc.kajovohotel.core.designsystem.rememberKajovoDeviceLayout
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
    val deviceLayout = rememberKajovoDeviceLayout()

    val normalizedPhone = normalizePhoneInput(phone)
    val isPhoneValid = normalizedPhone.isNullOrBlank() || phoneRegex.matches(normalizedPhone)

    Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        if (deviceLayout == KajovoDeviceLayout.TABLET) {
            AdaptiveTwoColumnBlock(
                leading = {
                    ProfileSummaryCard(
                        profile = profile,
                        message = message,
                        onChangePasswordClick = onChangePasswordClick,
                        onLogoutClick = onLogoutClick,
                    )
                },
                trailing = {
                    ProfileFormCard(
                        firstName = firstName,
                        lastName = lastName,
                        phone = phone,
                        note = note,
                        isPhoneValid = isPhoneValid,
                        onFirstNameChange = { firstName = it },
                        onLastNameChange = { lastName = it },
                        onPhoneChange = { phone = normalizePhoneInput(it).orEmpty() },
                        onNoteChange = { note = it },
                        onSave = { onSave(firstName.trim(), lastName.trim(), normalizedPhone.orEmpty(), note.trim()) },
                    )
                },
            )
        } else {
            ProfileSummaryCard(
                profile = profile,
                message = message,
                onChangePasswordClick = onChangePasswordClick,
                onLogoutClick = onLogoutClick,
            )
            ProfileFormCard(
                firstName = firstName,
                lastName = lastName,
                phone = phone,
                note = note,
                isPhoneValid = isPhoneValid,
                onFirstNameChange = { firstName = it },
                onLastNameChange = { lastName = it },
                onPhoneChange = { phone = normalizePhoneInput(it).orEmpty() },
                onNoteChange = { note = it },
                onSave = { onSave(firstName.trim(), lastName.trim(), normalizedPhone.orEmpty(), note.trim()) },
            )
        }
    }
}

@Composable
private fun ProfileSummaryCard(
    profile: AuthProfile?,
    message: String?,
    onChangePasswordClick: () -> Unit,
    onLogoutClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        profile?.let {
            FeatureCard(
                title = it.fullName,
                subtitle = it.email,
            )
            BulletLine(label = "Role", value = it.roles.joinToString { role -> role.displayName })
        }
        if (!message.isNullOrBlank()) {
            Text(text = message)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        Button(onClick = onChangePasswordClick, modifier = Modifier.weight(1f)) {
            Text(text = "Změnit heslo")
        }
        OutlinedButton(onClick = onLogoutClick, modifier = Modifier.weight(1f)) {
            Text(text = "Odhlásit")
        }
        }
    }
}

@Composable
private fun ProfileFormCard(
    firstName: String,
    lastName: String,
    phone: String,
    note: String,
    isPhoneValid: Boolean,
    onFirstNameChange: (String) -> Unit,
    onLastNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        Row(horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
        OutlinedTextField(
            value = firstName,
            onValueChange = onFirstNameChange,
            modifier = Modifier.weight(1f),
            label = { Text("Jméno") },
            singleLine = true,
        )
        OutlinedTextField(
            value = lastName,
            onValueChange = onLastNameChange,
            modifier = Modifier.weight(1f),
            label = { Text("Příjmení") },
            singleLine = true,
        )
        }
        OutlinedTextField(
            value = phone,
            onValueChange = onPhoneChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Telefon") },
            supportingText = {
                if (!isPhoneValid) {
                    Text("Telefon musí být ve formátu E.164.")
                } else {
                    Text("+420123456789")
                }
            },
            isError = !isPhoneValid,
            singleLine = true,
        )
        OutlinedTextField(
            value = note,
            onValueChange = onNoteChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Poznámka") },
            minLines = 1,
            maxLines = 2,
        )
        Button(
            onClick = onSave,
            enabled = firstName.isNotBlank() && lastName.isNotBlank() && isPhoneValid,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = "Uložit profil")
        }
    }
}

@Composable
fun ChangePasswordScreen(message: String?, onSubmit: (String, String) -> Unit) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }

    Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        Text("Minimálně 8 znaků.", style = MaterialTheme.typography.bodySmall)
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

    Column(modifier = Modifier.imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        Text(text = "Obnovení hesla", style = MaterialTheme.typography.titleLarge)
        Text("Minimálně 8 znaků.", style = MaterialTheme.typography.bodySmall)
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
