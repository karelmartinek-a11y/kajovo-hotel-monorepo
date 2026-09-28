package cz.hcasc.kajovohotel.feature.auth.login

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.designsystem.FullBrandLockup
import cz.hcasc.kajovohotel.core.common.PortalLocalization
import cz.hcasc.kajovohotel.core.designsystem.localize

@Composable
fun LoginScreen(
    isBusy: Boolean,
    errorMessage: String?,
    onSubmit: (String, String) -> Unit,
    resetRequestBusy: Boolean = false,
    resetRequestMessage: String? = null,
    onRequestPasswordReset: (String) -> Unit = {},
) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var resetOpen by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val locale by PortalLocalization.locale.collectAsState()
    val focusManager = LocalFocusManager.current
    val canSubmit = !isBusy && email.isNotBlank() && password.isNotBlank()
    val submit = {
        if (canSubmit) {
            focusManager.clearFocus()
            onSubmit(email.trim(), password)
        }
    }
    BoxWithConstraints(Modifier.fillMaxSize().imePadding().padding(horizontal = 24.dp)) {
        val compact = maxHeight < 440.dp
        Column(
            modifier = Modifier.align(Alignment.TopCenter).widthIn(max = 440.dp)
                .fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(vertical = if (compact) 8.dp else 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("cs" to "🇨🇿 Čeština", "en" to "🇬🇧 English", "uk" to "🇺🇦 Українська").forEach { (code, label) ->
                    FilterChip(
                        selected = locale == code,
                        onClick = { PortalLocalization.setLocale(context, code) },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1, softWrap = false) },
                    )
                }
            }
            FullBrandLockup(modifier = Modifier.height(if (compact) 64.dp else 140.dp))
            Text(localize("Přihlášení"), style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = email, onValueChange = { email = it },
                modifier = Modifier.fillMaxWidth().testTag("login-username"),
                label = { Text(localize("Uživatelské jméno")) },
                singleLine = true, enabled = !isBusy,
                isError = !errorMessage.isNullOrBlank(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(androidx.compose.ui.focus.FocusDirection.Down) }),
            )
            OutlinedTextField(
                value = password, onValueChange = { password = it },
                modifier = Modifier.fillMaxWidth().testTag("login-password"),
                label = { Text(localize("Heslo")) },
                singleLine = true, enabled = !isBusy,
                isError = !errorMessage.isNullOrBlank(),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
            if (!errorMessage.isNullOrBlank()) {
                Text(
                    text = errorMessage, color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth().testTag("login-error")
                        .semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
            Button(
                onClick = submit, enabled = canSubmit,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("login-submit"),
            ) { Text(localize(if (isBusy) "Přihlašuji…" else "Přihlásit")) }
            TextButton(
                onClick = { resetOpen = !resetOpen },
                modifier = Modifier.fillMaxWidth().testTag("password-reset-request-toggle"),
            ) { Text(localize(if (resetOpen) "Zavřít obnovu hesla" else "Zapomněli jste heslo?")) }
            if (resetOpen) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    modifier = Modifier.fillMaxWidth().testTag("password-reset-request-email"),
                    label = { Text(localize("E-mail pro obnovení přístupu")) },
                    singleLine = true,
                    enabled = !resetRequestBusy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
                )
                Button(
                    onClick = { if (email.trim().contains('@')) onRequestPasswordReset(email.trim()) },
                    enabled = !resetRequestBusy && email.trim().contains('@'),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("password-reset-request-submit"),
                ) { Text(localize(if (resetRequestBusy) "Odesílám žádost…" else "Poslat odkaz pro změnu hesla")) }
                if (!resetRequestMessage.isNullOrBlank()) {
                    Text(
                        text = localize(resetRequestMessage),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.fillMaxWidth().testTag("password-reset-request-result")
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            }
        }
    }
}
