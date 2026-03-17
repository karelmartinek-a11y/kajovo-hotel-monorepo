package cz.hcasc.kajovohotel.feature.utility

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import cz.hcasc.kajovohotel.core.designsystem.FeatureCard
import cz.hcasc.kajovohotel.core.designsystem.StatePane
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable fun IntroScreen() = StatePane(title = "Spouštím hotelový portál", body = "Probíhá kontrola session a role guardů.")
@Composable fun OfflineScreen(onRetry: () -> Unit) = StatePane(title = "Offline režim", body = "Síť není dostupná. Zkontrolujte připojení a opakujte akci.", actionLabel = "Zkusit znovu", onAction = onRetry)
@Composable fun MaintenanceScreen(onBack: () -> Unit) = StatePane(title = "Údržba", body = "Backend dočasně hlásí maintenance stav.", actionLabel = "Zpět", onAction = onBack)
@Composable fun NotFoundScreen(onBack: () -> Unit) = StatePane(title = "Stránka nenalezena", body = "Tato route není součástí ověřeného non-admin scope.", actionLabel = "Zpět", onAction = onBack)
@Composable fun AccessDeniedScreen(onBack: () -> Unit) = StatePane(title = "Přístup odepřen", body = "Aktivní role nebo serverová permission neumožňuje tuto akci.", actionLabel = "Zpět", onAction = onBack)
@Composable fun GlobalBlockingErrorScreen(onRetry: () -> Unit) = StatePane(title = "Blokující chyba", body = "Aplikace zachytila stav, který vyžaduje nové ověření session.", actionLabel = "Zkusit znovu", onAction = onRetry)

@Composable fun FeatureLoadingCard(title: String, subtitle: String) { Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) { FeatureCard(title = title, subtitle = subtitle); CircularProgressIndicator() } }
@Composable fun FeatureEmptyCard(title: String, body: String) { FeatureCard(title = title, subtitle = body) }
@Composable fun FeatureErrorCard(title: String, body: String) { Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3)) { FeatureCard(title = title, subtitle = body); Text(text = body, color = MaterialTheme.colorScheme.error) } }
