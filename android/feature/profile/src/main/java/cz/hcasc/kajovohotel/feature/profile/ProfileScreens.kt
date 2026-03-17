package cz.hcasc.kajovohotel.feature.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
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
import cz.hcasc.kajovohotel.core.designsystem.BulletLine
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.AuthProfile

@Composable
fun ProfileScreen(profile: AuthProfile?, message: String?, onSave: (String, String, String, String) -> Unit, onChangePasswordClick: () -> Unit) {
    var firstName by remember(profile?.firstName) { mutableStateOf(profile?.firstName.orEmpty()) }
    var lastName by remember(profile?.lastName) { mutableStateOf(profile?.lastName.orEmpty()) }
    var phone by remember(profile?.phone) { mutableStateOf(profile?.phone.orEmpty()) }
    var note by remember(profile?.note) { mutableStateOf(profile?.note.orEmpty()) }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Můj profil", style = MaterialTheme.typography.headlineMedium)
        profile?.let {
            FeatureCard(title = it.fullName, subtitle = it.email)
            BulletLine(label = "Role", value = it.roles.joinToString { role -> role.displayName })
        }
        OutlinedTextField(value = firstName, onValueChange = { firstName = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Jméno") })
        OutlinedTextField(value = lastName, onValueChange = { lastName = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Příjmení") })
        OutlinedTextField(value = phone, onValueChange = { phone = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Telefon") })
        OutlinedTextField(value = note, onValueChange = { note = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Poznámka") })
        if (!message.isNullOrBlank()) Text(text = message)
        Button(onClick = { onSave(firstName.trim(), lastName.trim(), phone.trim(), note.trim()) }, enabled = firstName.isNotBlank() && lastName.isNotBlank()) { Text(text = "Uložit profil") }
        Button(onClick = onChangePasswordClick) { Text(text = "Změnit heslo") }
    }
}

@Composable
fun ChangePasswordScreen(message: String?, onSubmit: (String, String) -> Unit) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Změna hesla", style = MaterialTheme.typography.headlineMedium)
        FeatureCard(title = "Session-first bezpečnost", subtitle = "Po změně hesla dojde k vyžádání nového přihlášení podle serverového kontraktu.")
        OutlinedTextField(value = oldPassword, onValueChange = { oldPassword = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Stávající heslo") }, visualTransformation = PasswordVisualTransformation())
        OutlinedTextField(value = newPassword, onValueChange = { newPassword = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Nové heslo") }, visualTransformation = PasswordVisualTransformation())
        if (!message.isNullOrBlank()) Text(text = message)
        Button(onClick = { onSubmit(oldPassword, newPassword) }, enabled = oldPassword.length >= 8 && newPassword.length >= 8) { Text(text = "Potvrdit změnu") }
    }
}
