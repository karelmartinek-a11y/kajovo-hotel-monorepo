package cz.hcasc.kajovohotel.feature.auth.login

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    var validationError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val locale by PortalLocalization.locale.collectAsState()
    val focusManager = LocalFocusManager.current
    val loginScrollState = rememberScrollState()
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Color(0xFFE6DED7),
        unfocusedBorderColor = Color(0xFFE6DED7),
        focusedLabelColor = Color(0xFFFF6A2E),
        unfocusedLabelColor = Color(0xFF4F4742),
        focusedContainerColor = Color.Transparent,
        unfocusedContainerColor = Color.Transparent,
        cursorColor = Color(0xFFFF6A2E),
    )
    val displayError = errorMessage ?: validationError
    val canSubmit = !isBusy
    val requiredCredentialsMessage = localize("Vyplňte uživatelské jméno i heslo.")
    LaunchedEffect(displayError) {
        if (!displayError.isNullOrBlank()) {
            withFrameNanos { }
            loginScrollState.animateScrollTo(loginScrollState.maxValue)
        }
    }
    val submit = {
        if (canSubmit) {
            focusManager.clearFocus()
            if (email.isBlank() || password.isBlank()) {
                validationError = requiredCredentialsMessage
            } else {
                validationError = null
                onSubmit(email.trim(), password)
            }
        }
    }
    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        val compact = maxHeight < 600.dp
        Column(
            modifier = Modifier.align(Alignment.TopCenter).widthIn(max = 560.dp)
                .fillMaxWidth().verticalScroll(loginScrollState)
                .padding(horizontal = 16.dp, vertical = if (compact) 8.dp else 18.dp),
            verticalArrangement = Arrangement.spacedBy(if (compact) 12.dp else 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 8.dp,
            ) {
                Column(Modifier.padding(if (compact) 14.dp else 22.dp), verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        listOf("cs" to "🇨🇿 Čeština", "en" to "🇬🇧 English", "uk" to "🇺🇦 Українська").forEach { (code, label) ->
                            FilterChip(
                                selected = locale == code,
                                onClick = { PortalLocalization.setLocale(context, code) },
                                label = { Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1, softWrap = false) },
                            )
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Image(painterResource(R.drawable.kajovo_portal_mark), null, Modifier.size(52.dp))
                        Column {
                            Text(buildAnnotatedString {
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Kájovo") }
                                withStyle(SpanStyle(color = Color(0xFFFF5A1F), fontWeight = FontWeight.Light)) { append("Hotel") }
                            }, style = MaterialTheme.typography.headlineSmall, maxLines = 1)
                            if (!compact) Text(localize("Provozní portál").uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (!compact) {
                        Text(localize("Kájovo Hotel · Portál").uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(localize("Vítejte v Kájovo Hotel"), style = MaterialTheme.typography.headlineLarge)
                        Text(
                            localize("Přihlaste se do provozního portálu. Po ověření účtu navážete přesně tam, kde začíná dnešní směna."),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        Text(localize("Přihlášení"), style = MaterialTheme.typography.titleLarge)
                    }
                    if (compact && !displayError.isNullOrBlank()) {
                        Text(
                            text = displayError.orEmpty(), color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.fillMaxWidth().testTag("login-error")
                                .semantics { liveRegion = LiveRegionMode.Assertive },
                        )
                    }
                    Text(localize("Uživatelské jméno").uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp))
                    OutlinedTextField(
                        value = email, onValueChange = { email = it; validationError = null },
                        modifier = Modifier.fillMaxWidth().testTag("login-username"),
                        shape = RoundedCornerShape(12.dp), colors = fieldColors,
                        singleLine = true, enabled = !isBusy,
                        isError = !displayError.isNullOrBlank(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(androidx.compose.ui.focus.FocusDirection.Down) }),
                    )
                    Text(localize("Heslo").uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp))
                    OutlinedTextField(
                        value = password, onValueChange = { password = it; validationError = null },
                        modifier = Modifier.fillMaxWidth().testTag("login-password"),
                        shape = RoundedCornerShape(12.dp), colors = fieldColors,
                        singleLine = true, enabled = !isBusy,
                        isError = !displayError.isNullOrBlank(),
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                    )
                    if (!compact && !displayError.isNullOrBlank()) {
                        Text(
                            text = displayError.orEmpty(), color = MaterialTheme.colorScheme.error,
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
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
                        modifier = Modifier.fillMaxWidth().testTag("password-reset-request-toggle"),
                    ) { Text(localize(if (resetOpen) "Zavřít obnovu hesla" else "Zapomněli jste heslo?")) }
                    if (resetOpen) {
                        Text(localize("E-mail pro obnovení přístupu").uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp))
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            modifier = Modifier.fillMaxWidth().testTag("password-reset-request-email"),
                            shape = RoundedCornerShape(12.dp), colors = fieldColors,
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
            if (!compact) Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(localize("Dnešní provoz").uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(localize("Jedno rozhraní pro celou směnu"), style = MaterialTheme.typography.titleLarge)
                    listOf(
                        Icons.Outlined.Restaurant to "Snídaně",
                        Icons.Outlined.Build to "Závady a pokojská",
                        Icons.Outlined.Search to "Ztráty a nálezy",
                        Icons.Outlined.Description to "Hlášení, profil a směnové úkoly",
                    ).forEach { (icon, label) ->
                        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface) {
                            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Icon(icon, contentDescription = null, tint = Color(0xFFFF5A1F))
                                Text(localize(label), style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
        }
    }
}
