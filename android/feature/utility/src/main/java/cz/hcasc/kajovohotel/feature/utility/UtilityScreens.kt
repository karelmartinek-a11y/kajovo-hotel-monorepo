package cz.hcasc.kajovohotel.feature.utility

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import cz.hcasc.kajovohotel.core.designsystem.BrandFooter
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.FullBrandLockup
import cz.hcasc.kajovohotel.core.designsystem.SignageBadge
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun IntroScreen() = RichStatePane(
    title = "Načítání…",
    body = "",
    useFullBrandLockup = true,
    supportingContent = { CircularProgressIndicator() },
)

@Composable
fun OfflineScreen(
    onRetry: () -> Unit,
    onContinueOffline: (() -> Unit)? = null,
) = RichStatePane(
    title = "Jste offline",
    body = "Zkontrolujte připojení k internetu.",
    actionLabel = "Zkusit znovu",
    onAction = onRetry,
    secondaryActionLabel = if (onContinueOffline != null) "Pokračovat offline" else null,
    onSecondaryAction = onContinueOffline,
)

@Composable
fun MaintenanceScreen(
    onBack: () -> Unit,
    onDiagnosticsClick: (() -> Unit)? = null,
) = RichStatePane(
    title = "Probíhá údržba",
    body = "Zkuste to za chvíli.",
    actionLabel = "Zpět na přehled",
    onAction = onBack,
    secondaryActionLabel = if (onDiagnosticsClick != null) "Diagnostika provozu" else null,
    onSecondaryAction = onDiagnosticsClick,
)

@Composable
fun NotFoundScreen(onBack: () -> Unit) = RichStatePane(
    title = "404",
    body = "Obrazovka nebyla nalezena.",
    actionLabel = "Zpět na přehled",
    onAction = onBack,
)

@Composable
fun AccessDeniedScreen(
    onBack: () -> Unit,
    moduleLabel: String? = null,
    roleLabel: String? = null,
    userId: String? = null,
) = RichStatePane(
    title = "Přístup odepřen",
    body = if (!moduleLabel.isNullOrBlank() && !roleLabel.isNullOrBlank() && !userId.isNullOrBlank()) {
        "Role $roleLabel (uživatel $userId) nemá oprávnění pro modul $moduleLabel."
    } else {
        "K této sekci nemáte přístup."
    },
    actionLabel = "Zpět na přehled",
    onAction = onBack,
)

@Composable
fun GlobalBlockingErrorScreen(onRetry: () -> Unit) = RichStatePane(
    title = "Přístup se nepodařilo ověřit",
    body = "Zkuste to znovu.",
    actionLabel = "Zkusit znovu",
    onAction = onRetry,
)

@Composable
fun AppUpdatePromptScreen(
    title: String,
    message: String,
    latestVersion: String,
    onUpdateClick: () -> Unit,
    onContinueClick: (() -> Unit)? = null,
) {
    RichStatePane(
        title = title,
        body = "$message\n\nNová verze: $latestVersion",
        useFullBrandLockup = true,
        actionLabel = "Stáhnout aktualizaci",
        onAction = onUpdateClick,
        secondaryActionLabel = if (onContinueClick != null) "Pokračovat bez aktualizace" else null,
        onSecondaryAction = onContinueClick,
    )
}

@Composable
fun FeatureLoadingCard(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        FeatureCard(title = title, subtitle = subtitle)
        CircularProgressIndicator()
    }
}

@Composable
fun FeatureEmptyCard(title: String, body: String) {
    FeatureCard(title = title, subtitle = body)
}

@Composable
fun FeatureErrorCard(title: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) {
        FeatureCard(title = title, subtitle = "")
        Text(text = body, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun UtilityInfoStack(
    title: String,
    body: String,
) {
    FeatureCard(title = title, subtitle = body)
}

@Composable
private fun RichStatePane(
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    secondaryActionLabel: String? = null,
    onSecondaryAction: (() -> Unit)? = null,
    useFullBrandLockup: Boolean = false,
    supportingContent: @Composable ColumnScope.() -> Unit = {},
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (useFullBrandLockup) {
                    FullBrandLockup()
                } else {
                    SignageBadge()
                }
                Text(text = title, style = MaterialTheme.typography.headlineMedium)
                if (body.isNotBlank()) Text(text = body, style = MaterialTheme.typography.bodyLarge)
            }
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                supportingContent()
            }
            if (actionLabel != null || secondaryActionLabel != null) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
                ) {
                    if (secondaryActionLabel != null && onSecondaryAction != null) {
                        OutlinedButton(
                            onClick = onSecondaryAction,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(text = secondaryActionLabel)
                        }
                    }
                    if (actionLabel != null && onAction != null) {
                        Button(
                            onClick = onAction,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(text = actionLabel)
                        }
                    }
                }
            }
        }
    }
}
