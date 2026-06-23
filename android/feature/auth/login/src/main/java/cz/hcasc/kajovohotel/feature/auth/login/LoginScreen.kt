package cz.hcasc.kajovohotel.feature.auth.login

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.common.Branding
import cz.hcasc.kajovohotel.core.designsystem.AdaptiveTwoColumnBlock
import cz.hcasc.kajovohotel.core.designsystem.BrandFooter
import cz.hcasc.kajovohotel.core.designsystem.FullBrandLockup
import cz.hcasc.kajovohotel.core.designsystem.KajovoDeviceLayout
import cz.hcasc.kajovohotel.core.designsystem.rememberKajovoDeviceLayout
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun LoginScreen(
    isBusy: Boolean,
    errorMessage: String?,
    onSubmit: (String, String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val deviceLayout = rememberKajovoDeviceLayout()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(KajovoSpacingTokens.S4),
        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        FullBrandLockup()
        Text(
            text = "VĂ­tejte v ${Branding.APP_NAME}",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "ProvoznĂ­ pĹ™ihlĂˇĹˇenĂ­ pro recepci, sklad, hlĂˇĹˇenĂ­ i servisnĂ­ moduly.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (deviceLayout == KajovoDeviceLayout.TABLET) {
            AdaptiveTwoColumnBlock(
                leading = {
                    LoginFormCard(
                        email = email,
                        password = password,
                        errorMessage = errorMessage,
                        isBusy = isBusy,
                        onEmailChange = { email = it },
                        onPasswordChange = { password = it },
                        onSubmit = { onSubmit(email.trim(), password) },
                    )
                },
                trailing = {
                    LoginOverviewCard()
                },
            )
        } else {
            LoginOverviewCard()
            LoginFormCard(
                email = email,
                password = password,
                errorMessage = errorMessage,
                isBusy = isBusy,
                onEmailChange = { email = it },
                onPasswordChange = { password = it },
                onSubmit = { onSubmit(email.trim(), password) },
            )
        }
        BrandFooter()
    }
}

@Composable
private fun LoginFormCard(
    email: String,
    password: String,
    errorMessage: String?,
    isBusy: Boolean,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        OutlinedTextField(
            value = email,
            onValueChange = onEmailChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("UĹľivatelskĂ© jmĂ©no") },
            singleLine = true,
            enabled = !isBusy,
        )
        OutlinedTextField(
            value = password,
            onValueChange = onPasswordChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Heslo") },
            singleLine = true,
            enabled = !isBusy,
            visualTransformation = PasswordVisualTransformation(),
        )
        Button(
            onClick = onSubmit,
            enabled = !isBusy && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(
                imageVector = Icons.Outlined.Key,
                contentDescription = null,
                modifier = Modifier.padding(end = KajovoSpacingTokens.S2),
            )
            Text(text = if (isBusy) "ProbĂ­hĂˇ pĹ™ihlĂˇĹˇenĂ­" else "PĹ™ihlĂˇsit")
        }
        Text(
            text = "Reset hesla odesĂ­lĂˇ pouze administrĂˇtor ze sprĂˇvy uĹľivatelĹŻ.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Aplikace po spuĹˇtÄ›nĂ­ automaticky ovÄ›Ĺ™uje dostupnost novĂ© verze jeĹˇtÄ› pĹ™ed pĹ™ihlĂˇĹˇenĂ­m.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!errorMessage.isNullOrBlank()) {
            Text(text = errorMessage, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun LoginOverviewCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(KajovoRadiusTokens.R16),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
        ) {
            HospitalityPill(text = "HotelovĂ˝ provoz â€˘ produkÄŤnĂ­ pĹ™Ă­stup")
            Text(
                text = "PĹ™ihlaste se do provoznĂ­ho portĂˇlu",
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                text = "Po ovÄ›Ĺ™enĂ­ ĂşÄŤtu navĂˇĹľete pĹ™esnÄ› tam, kde zaÄŤĂ­nĂˇ dneĹˇnĂ­ smÄ›na.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            HospitalityFeatureRow(
                icon = Icons.Outlined.VerifiedUser,
                title = "Role podle oprĂˇvnÄ›nĂ­",
                body = "Aplikace po pĹ™ihlĂˇĹˇenĂ­ otevĹ™e jen moduly, kterĂ© mĂˇ ĂşÄŤet skuteÄŤnÄ› povolenĂ©.",
            )
            HospitalityFeatureRow(
                icon = Icons.Outlined.Sync,
                title = "Kontrola releasu pĹ™ed vstupem",
                body = "Android klient pĹ™ed pĹ™ihlĂˇĹˇenĂ­m ovÄ›Ĺ™uje novou verzi a pĹ™ipravĂ­ aktualizaci.",
            )
            HospitalityFeatureRow(
                icon = Icons.Outlined.Security,
                title = "BezpeÄŤnĂ˝ provoznĂ­ pĹ™Ă­stup",
                body = "Reset hesla i nĂˇpovÄ›du k ĂşÄŤtu drĹľĂ­ administrace, ne veĹ™ejnĂ˝ formulĂˇĹ™.",
            )
        }
    }
}

@Composable
private fun HospitalityPill(text: String) {
    Box(
        modifier = Modifier
            .background(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = RoundedCornerShape(KajovoRadiusTokens.R12),
            )
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outlineVariant,
                shape = RoundedCornerShape(KajovoRadiusTokens.R12),
            )
            .padding(horizontal = KajovoSpacingTokens.S3, vertical = KajovoSpacingTokens.S2),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
private fun HospitalityFeatureRow(
    icon: ImageVector,
    title: String,
    body: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .background(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = CircleShape,
                )
                .padding(KajovoSpacingTokens.S2),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
        Column(
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S1),
        ) {
            Text(text = title, style = MaterialTheme.typography.labelLarge)
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
