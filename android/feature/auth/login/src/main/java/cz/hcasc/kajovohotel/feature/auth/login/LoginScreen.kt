package cz.hcasc.kajovohotel.feature.auth.login

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import cz.hcasc.kajovohotel.core.designsystem.BrandFooter
import cz.hcasc.kajovohotel.core.designsystem.FullBrandLockup
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
        Text(
            text = "Provozní přihlášení pro recepci, sklad, hlášení i servisní moduly.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
                HospitalityPill(text = "Hotelový provoz • produkční přístup")
                Text(
                    text = "Přihlaste se do provozního portálu",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = "Po ověření účtu navážete přesně tam, kde začíná dnešní směna.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                HospitalityFeatureRow(
                    icon = Icons.Outlined.VerifiedUser,
                    title = "Role podle oprávnění",
                    body = "Aplikace po přihlášení otevře jen moduly, které má účet skutečně povolené.",
                )
                HospitalityFeatureRow(
                    icon = Icons.Outlined.Sync,
                    title = "Kontrola releasu před vstupem",
                    body = "Android klient před přihlášením ověřuje novou verzi a připraví aktualizaci.",
                )
                HospitalityFeatureRow(
                    icon = Icons.Outlined.Security,
                    title = "Bezpečný provozní přístup",
                    body = "Reset hesla i nápovědu k účtu drží administrace, ne veřejný formulář.",
                )
            }
        }
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
            Icon(
                imageVector = Icons.Outlined.Key,
                contentDescription = null,
                modifier = Modifier.padding(end = KajovoSpacingTokens.S2),
            )
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
