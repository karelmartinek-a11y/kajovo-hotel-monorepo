package cz.hcasc.kajovohotel.core.designsystem

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoTypographyTokens

private val LightColors: ColorScheme = lightColorScheme(
    primary = KajovoColorTokens.Ink,
    onPrimary = KajovoColorTokens.SignWhite,
    secondary = KajovoColorTokens.Metal,
    onSecondary = KajovoColorTokens.SignWhite,
    tertiary = KajovoColorTokens.Info,
    onTertiary = KajovoColorTokens.SignWhite,
    background = KajovoColorTokens.Surface,
    onBackground = KajovoColorTokens.Ink,
    surface = KajovoColorTokens.SurfaceRaised,
    onSurface = KajovoColorTokens.Ink,
    surfaceVariant = KajovoColorTokens.SurfaceSubtle,
    onSurfaceVariant = KajovoColorTokens.InkSecondary,
    error = KajovoColorTokens.Error,
    onError = KajovoColorTokens.SignWhite,
    outline = KajovoColorTokens.Divider,
)

private val DarkColors: ColorScheme = darkColorScheme(
    primary = KajovoColorTokens.SignWhite,
    onPrimary = KajovoColorTokens.Ink,
    secondary = KajovoColorTokens.SubtleMetal,
    onSecondary = KajovoColorTokens.Ink,
    tertiary = KajovoColorTokens.Info,
    onTertiary = KajovoColorTokens.SignWhite,
    background = KajovoColorTokens.DarkSurface,
    onBackground = KajovoColorTokens.SignWhite,
    surface = KajovoColorTokens.DarkPanel,
    onSurface = KajovoColorTokens.SignWhite,
    surfaceVariant = KajovoColorTokens.DarkBorder,
    onSurfaceVariant = KajovoColorTokens.SubtleMetal,
    error = KajovoColorTokens.Error,
    onError = KajovoColorTokens.SignWhite,
    outline = KajovoColorTokens.DarkBorder,
)

private val KajovoTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = KajovoTypographyTokens.VychoziPismo,
        fontSize = KajovoTypographyTokens.TwoXl,
        lineHeight = 40.sp,
        fontWeight = FontWeight.Bold,
    ),
    headlineMedium = TextStyle(
        fontFamily = KajovoTypographyTokens.VychoziPismo,
        fontSize = KajovoTypographyTokens.Xl,
        lineHeight = 32.sp,
        fontWeight = FontWeight.Bold,
    ),
    titleLarge = TextStyle(
        fontFamily = KajovoTypographyTokens.VychoziPismo,
        fontSize = KajovoTypographyTokens.Lg,
        lineHeight = 28.sp,
        fontWeight = FontWeight.Bold,
    ),
    bodyLarge = TextStyle(
        fontFamily = KajovoTypographyTokens.VychoziPismo,
        fontSize = KajovoTypographyTokens.Md,
        lineHeight = 24.sp,
        fontWeight = KajovoTypographyTokens.WeightRegular,
    ),
    bodyMedium = TextStyle(
        fontFamily = KajovoTypographyTokens.VychoziPismo,
        fontSize = KajovoTypographyTokens.Sm,
        lineHeight = 20.sp,
        fontWeight = KajovoTypographyTokens.WeightRegular,
    ),
    labelLarge = TextStyle(
        fontFamily = KajovoTypographyTokens.VychoziPismo,
        fontSize = KajovoTypographyTokens.Sm,
        fontWeight = KajovoTypographyTokens.WeightBold,
    ),
)

@Composable
fun KajovoTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = KajovoTypography,
        content = content,
    )
}
