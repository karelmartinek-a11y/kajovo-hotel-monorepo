package cz.hcasc.kajovohotel.feature.utility

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
    title = "Spouštím KájovoHotel",
    body = "Ověřuji přihlášení, dostupné moduly a připravuji pracovní plochu pro dnešní směnu.",
    useFullBrandLockup = true,
    supportingContent = {
        UtilityInfoStack(
            title = "Co se teď kontroluje",
            body = "Relace, role, dostupné moduly, servisní stav a navazující provozní data.",
        )
        UtilityInfoStack(
            title = "Co bude následovat",
            body = "Po dokončení se otevře přihlášení, role-select nebo přímo pracovní plocha podle stavu účtu.",
        )
        CircularProgressIndicator()
    },
)

@Composable
fun OfflineScreen(onRetry: () -> Unit) = RichStatePane(
    title = "Aplikace je offline",
    body = "Nepodařilo se navázat spojení se serverem hotelu. Zkontrolujte připojení a zkuste načtení znovu.",
    actionLabel = "Zkusit znovu",
    onAction = onRetry,
    supportingContent = {
        UtilityInfoStack(
            title = "Co zkontrolovat",
            body = "Wi-Fi, VPN, dostupnost hotelové sítě a případný výpadek serveru nebo DNS.",
        )
        UtilityInfoStack(
            title = "Co se po obnově stane",
            body = "Aplikace znovu ověří relaci a vrátí vás zpět do rozpracovaného toku.",
        )
    },
)

@Composable
fun MaintenanceScreen(onBack: () -> Unit) = RichStatePane(
    title = "Portál je dočasně nedostupný",
    body = "Server právě hlásí servisní odstávku. Počkejte chvíli a potom načtení opakujte.",
    actionLabel = "Zpět",
    onAction = onBack,
    supportingContent = {
        UtilityInfoStack(
            title = "Servisní režim",
            body = "Právě probíhá údržba nebo nasazení nové verze. Data jsou chráněná, jen nejsou dočasně dostupná.",
        )
        UtilityInfoStack(
            title = "Doporučený postup",
            body = "Počkejte na dokončení údržby a vraťte se na stejnou obrazovku nebo do přehledu portálu.",
        )
    },
)

@Composable
fun NotFoundScreen(onBack: () -> Unit) = RichStatePane(
    title = "Stránka nebyla nalezena",
    body = "Požadovaná obrazovka v aplikaci není dostupná nebo už není součástí tohoto provozního toku.",
    actionLabel = "Zpět",
    onAction = onBack,
    supportingContent = {
        UtilityInfoStack(
            title = "Nejrychlejší pokračování",
            body = "Vraťte se na přehled nebo otevřete modul, který potřebujete dokončit.",
        )
        UtilityInfoStack(
            title = "Co se stalo",
            body = "Může jít o neplatnou cestu, starý odkaz nebo obrazovku, která už v této roli není k dispozici.",
        )
    },
)

@Composable
fun AccessDeniedScreen(onBack: () -> Unit) = RichStatePane(
    title = "Přístup odepřen",
    body = "Aktivní role nemá k této obrazovce oprávnění. Vraťte se zpět nebo přepněte roli, pokud ji máte k dispozici.",
    actionLabel = "Zpět",
    onAction = onBack,
    supportingContent = {
        UtilityInfoStack(
            title = "Kontrola oprávnění",
            body = "Přístup je řízen aktivní rolí a právy účtu. Bez oprávnění se tato obrazovka nezobrazí ani na webu, ani v Androidu.",
        )
    },
)

@Composable
fun GlobalBlockingErrorScreen(onRetry: () -> Unit) = RichStatePane(
    title = "Je potřeba znovu ověřit přístup",
    body = "Aplikace zachytila stav, který vyžaduje nové načtení relace. Zkuste pokračovat znovu.",
    actionLabel = "Zkusit znovu",
    onAction = onRetry,
    supportingContent = {
        UtilityInfoStack(
            title = "Bezpečný restart toku",
            body = "Obvykle jde o dočasný globální blok, který se vyřeší novým načtením relace nebo obnovením serverového stavu.",
        )
    },
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
        supportingContent = {
            UtilityInfoStack(
                title = "Proč se doporučuje aktualizace",
                body = "Nová verze přináší opravy provozních chyb, sjednocené značkování a bezpečnější start portálu.",
            )
        },
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
        FeatureCard(title = title, subtitle = body)
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
        modifier = Modifier.fillMaxSize(),
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
                Text(text = body, style = MaterialTheme.typography.bodyLarge)
            }
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
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
            BrandFooter()
        }
    }
}
