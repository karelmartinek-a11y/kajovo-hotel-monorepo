package cz.hcasc.kajovohotel.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.designsystem.KajovoTheme
import cz.hcasc.kajovohotel.core.designsystem.PortalChrome
import cz.hcasc.kajovohotel.core.designsystem.CollapsibleFilters
import androidx.compose.material3.Text
import cz.hcasc.kajovohotel.feature.auth.login.LoginScreen
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import androidx.compose.ui.graphics.asAndroidBitmap
import android.graphics.Bitmap
import androidx.test.platform.app.InstrumentationRegistry
import cz.hcasc.kajovohotel.feature.utility.*
import cz.hcasc.kajovohotel.feature.profile.ResetPasswordScreen
import cz.hcasc.kajovohotel.feature.breakfast.BreakfastDietSummary

class ReadabilityTest {
    @get:Rule val compose = createComposeRule()

    private fun capture(name: String) {
        val directory = InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("readability")!!
        directory.mkdirs()
        java.io.File(directory, "$name.png").outputStream().use {
            compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }

    @Test fun dietSummaryShowsOnlyActiveDietsAndFitsNarrowScreen() {
        var active by mutableStateOf(false)
        compose.setContent {
            KajovoTheme(false) {
                Box(Modifier.width(280.dp)) {
                    BreakfastDietSummary(noMilk = active, noGluten = active, noPork = active)
                }
            }
        }
        compose.onNodeWithText("Bez diet").assertIsDisplayed()
        compose.onNodeWithText("Bez lepku").assertDoesNotExist()
        compose.runOnIdle { active = true }
        compose.onNodeWithText("Bez diet").assertDoesNotExist()
        listOf("Bez lepku", "Bez laktózy", "Bez vepřového").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
        capture("diet-summary-small")
    }

    @Test fun utilityScreensAndResetAreReadable() {
        var page by mutableStateOf(0)
        compose.setContent {
            KajovoTheme(false) {
                when (page) {
                    0 -> IntroScreen()
                    1 -> OfflineScreen(onRetry = {}, onContinueOffline = {})
                    2 -> MaintenanceScreen(onBack = {})
                    3 -> NotFoundScreen(onBack = {})
                    4 -> AccessDeniedScreen(onBack = {})
                    5 -> GlobalBlockingErrorScreen(onRetry = {})
                    6 -> AppUpdatePromptScreen("Aktualizace", "", "2.0.3 NG", onUpdateClick = {})
                    else -> ResetPasswordScreen(null, { _, _ -> }, {})
                }
            }
        }
        listOf("intro", "offline", "maintenance", "not-found", "access-denied", "error", "update", "reset").forEachIndexed { index, name ->
            compose.runOnIdle { page = index }
            compose.waitForIdle()
            capture(name)
        }
        compose.onNodeWithText("Nastavit nové heslo").assertIsDisplayed()
    }

    @Test fun navigationOffersSectionsAndProfile() {
        var destination = ""
        compose.setContent {
            KajovoTheme(false) {
                PortalChrome("Recepce", "Recepce", onProfileClick = { destination = "profile" },
                    sections = listOf("reports" to "Hlášení"), onSectionSelected = { destination = it }) {
                    Text("Obsah")
                }
            }
        }
        compose.onNodeWithContentDescription("Sekce a profil").performClick()
        compose.onNodeWithText("Hlášení").performClick()
        compose.runOnIdle { assertTrue(destination == "reports") }
        compose.onNodeWithContentDescription("Sekce a profil").performClick()
        compose.onNodeWithText("Profil").performClick()
        compose.runOnIdle { assertTrue(destination == "profile") }
    }

    @Test fun filtersDoNotOccupySpaceUntilRequested() {
        compose.setContent { KajovoTheme(false) { CollapsibleFilters { Text("Filtr pokoje") } } }
        compose.onNodeWithText("Filtr pokoje").assertDoesNotExist()
        compose.onNodeWithText("Filtry").performClick()
        compose.onNodeWithText("Filtr pokoje").assertIsDisplayed()
        compose.onNodeWithText("Skrýt filtry").performClick()
        compose.onNodeWithText("Filtr pokoje").assertDoesNotExist()
    }

    @Test fun failedLoginKeepsCredentialsAndErrorVisibleOnSmallPhone() {
        compose.setContent {
            KajovoTheme(darkTheme = false) {
                Box(Modifier.requiredSize(320.dp, 480.dp)) {
                    var error by remember { mutableStateOf<String?>(null) }
                    LoginScreen(false, error) { _, _ -> error = "Nesprávné jméno nebo heslo." }
                }
            }
        }
        compose.onNodeWithTag("login-username").performTextInput("native-qa@example.test")
        compose.onNodeWithTag("login-password").performTextInput("incorrect")
        compose.onNodeWithTag("login-submit").performClick()
        compose.onNodeWithTag("login-error").assertIsDisplayed()
        compose.onNodeWithTag("login-submit").assertIsDisplayed()
        compose.onNodeWithTag("login-username").assertTextContains("native-qa@example.test")
        capture("login-error-small")
    }

    @Test fun imeSubmitShowsErrorWithoutScrolling() {
        compose.setContent {
            KajovoTheme(darkTheme = false) {
                var error by remember { mutableStateOf<String?>(null) }
                LoginScreen(false, error) { _, _ -> error = "Nesprávné jméno nebo heslo." }
            }
        }
        compose.onNodeWithTag("login-username").performTextInput("native-qa@example.test")
        compose.onNodeWithTag("login-password").performTextInput("incorrect")
        compose.onNodeWithTag("login-password").performImeAction()
        compose.onNodeWithTag("login-error").assertIsDisplayed()
        compose.onNodeWithTag("login-submit").assertIsDisplayed()
    }

    @Test fun textContrastInBothThemes() {
        var dark by mutableStateOf(false)
        var ratios = emptyList<Float>()
        compose.setContent {
            KajovoTheme(darkTheme = dark) {
                val c = MaterialTheme.colorScheme
                SideEffect {
                    ratios = listOf(c.onBackground to c.background, c.onSurface to c.surface,
                        c.onSurfaceVariant to c.surfaceVariant, c.error to c.background,
                        c.onPrimary to c.primary, c.onSecondary to c.secondary,
                        c.onError to c.error).map { (fg, bg) ->
                        val a = fg.luminance(); val b = bg.luminance()
                        (maxOf(a, b) + .05f) / (minOf(a, b) + .05f)
                    }
                }
            }
        }
        compose.runOnIdle { assertTrue("Light contrast: $ratios", ratios.all { it >= 4.5f }); dark = true }
        compose.runOnIdle { assertTrue("Dark contrast: $ratios", ratios.all { it >= 4.5f }) }
    }
}
