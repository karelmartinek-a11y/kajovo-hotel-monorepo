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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.designsystem.FullBrandLockup

@Composable
fun LoginScreen(
    isBusy: Boolean,
    errorMessage: String?,
    onSubmit: (String, String) -> Unit,
) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
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
            FullBrandLockup(modifier = Modifier.height(if (compact) 64.dp else 140.dp))
            Text("Přihlášení", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = email, onValueChange = { email = it },
                modifier = Modifier.fillMaxWidth().testTag("login-username"),
                label = { Text("Uživatelské jméno") },
                singleLine = true, enabled = !isBusy,
                isError = !errorMessage.isNullOrBlank(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(androidx.compose.ui.focus.FocusDirection.Down) }),
            )
            OutlinedTextField(
                value = password, onValueChange = { password = it },
                modifier = Modifier.fillMaxWidth().testTag("login-password"),
                label = { Text("Heslo") },
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
            ) { Text(if (isBusy) "Přihlašuji…" else "Přihlásit") }
        }
    }
}
