package cz.hcasc.kajovohotel.feature.reception

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import cz.hcasc.kajovohotel.core.designsystem.BulletLine
import cz.hcasc.kajovohotel.core.designsystem.KajovoDeviceLayout
import cz.hcasc.kajovohotel.core.designsystem.rememberKajovoDeviceLayout
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

@Composable
fun ReceptionHubScreen(
    onBreakfastClick: () -> Unit,
    onLostFoundClick: () -> Unit,
    onReportsClick: () -> Unit,
) {
    val deviceLayout = rememberKajovoDeviceLayout()

    Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4)) {
        Text(text = "Recepce", style = MaterialTheme.typography.headlineMedium)
        Text(
            text = "Vyberte provoznĂ­ tok, kterĂ˝ chcete otevĹ™Ă­t. KaĹľdĂˇ karta vede do plnohodnotnĂ©ho pracovnĂ­ho vstupu, ne jen do struÄŤnĂ© zkratky.",
            style = MaterialTheme.typography.bodyMedium,
        )
        if (deviceLayout == KajovoDeviceLayout.TABLET) {
            ReceptionTabletGrid(
                onBreakfastClick = onBreakfastClick,
                onLostFoundClick = onLostFoundClick,
                onReportsClick = onReportsClick,
            )
        } else {
            ReceptionCards(
                onBreakfastClick = onBreakfastClick,
                onLostFoundClick = onLostFoundClick,
                onReportsClick = onReportsClick,
            )
        }
    }
}

@Composable
private fun ReceptionCards(
    onBreakfastClick: () -> Unit,
    onLostFoundClick: () -> Unit,
    onReportsClick: () -> Unit,
) {
    ReceptionActionCard(
        title = "ZpracovĂˇnĂ­ nĂˇlezĹŻ",
        subtitle = "Seznam ÄŤekajĂ­cĂ­ch nĂˇlezĹŻ, detail poloĹľky a pĹ™evzetĂ­ po recepci.",
        points = listOf(
            "OtevĹ™e pĹ™ehled ÄŤekajĂ­cĂ­ch zĂˇznamĹŻ.",
            "ZobrazĂ­ detail a stav zpracovĂˇnĂ­.",
            "Po potvrzenĂ­ nĂˇlez zmizĂ­ ze seznamu recepce.",
        ),
        actionLabel = "OtevĹ™Ă­t nĂˇlezy",
        onAction = onLostFoundClick,
    )
    ReceptionActionCard(
        title = "Import a sprĂˇva snĂ­danĂ­",
        subtitle = "DennĂ­ souhrn, seznam objednĂˇvek, detail, zaloĹľenĂ­, Ăşpravy i prĂˇce s PDF.",
        points = listOf(
            "NaÄŤte dennĂ­ pĹ™ehled a rozpracovanĂ© objednĂˇvky.",
            "UmoĹľnĂ­ otevĹ™Ă­t detail i upravit objednĂˇvku.",
            "Podporuje import i export PDF pro recepci.",
        ),
        actionLabel = "OtevĹ™Ă­t snĂ­danÄ›",
        onAction = onBreakfastClick,
    )
    ReceptionActionCard(
        title = "PĹ™ehled hlĂˇĹˇenĂ­",
        subtitle = "ProvoznĂ­ hlĂˇĹˇenĂ­ s detailem a Ăşpravami dostupnĂ˝mi pro oprĂˇvnÄ›nĂ© role.",
        points = listOf(
            "ZobrazĂ­ seznam provoznĂ­ch hlĂˇĹˇenĂ­.",
            "OtevĹ™e detail a Ăşpravu podle oprĂˇvnÄ›nĂ­ role.",
            "DrĹľĂ­ jednotnĂ˝ tok pro recepci i navazujĂ­cĂ­ provoz.",
        ),
        actionLabel = "OtevĹ™Ă­t hlĂˇĹˇenĂ­",
        onAction = onReportsClick,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReceptionTabletGrid(
    onBreakfastClick: () -> Unit,
    onLostFoundClick: () -> Unit,
    onReportsClick: () -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
        maxItemsInEachRow = 2,
    ) {
        TabletGridCell {
            ReceptionActionCard(
                title = "ZpracovĂˇnĂ­ nĂˇlezĹŻ",
                subtitle = "Seznam ÄŤekajĂ­cĂ­ch nĂˇlezĹŻ, detail poloĹľky a pĹ™evzetĂ­ po recepci.",
                points = listOf(
                    "OtevĹ™e pĹ™ehled ÄŤekajĂ­cĂ­ch zĂˇznamĹŻ.",
                    "ZobrazĂ­ detail a stav zpracovĂˇnĂ­.",
                    "Po potvrzenĂ­ nĂˇlez zmizĂ­ ze seznamu recepce.",
                ),
                actionLabel = "OtevĹ™Ă­t nĂˇlezy",
                onAction = onLostFoundClick,
            )
        }
        TabletGridCell {
            ReceptionActionCard(
                title = "Import a sprĂˇva snĂ­danĂ­",
                subtitle = "DennĂ­ souhrn, seznam objednĂˇvek, detail, zaloĹľenĂ­, Ăşpravy i prĂˇce s PDF.",
                points = listOf(
                    "NaÄŤte dennĂ­ pĹ™ehled a rozpracovanĂ© objednĂˇvky.",
                    "UmoĹľnĂ­ otevĹ™Ă­t detail i upravit objednĂˇvku.",
                    "Podporuje import i export PDF pro recepci.",
                ),
                actionLabel = "OtevĹ™Ă­t snĂ­danÄ›",
                onAction = onBreakfastClick,
            )
        }
        TabletGridCell {
            ReceptionActionCard(
                title = "PĹ™ehled hlĂˇĹˇenĂ­",
                subtitle = "ProvoznĂ­ hlĂˇĹˇenĂ­ s detailem a Ăşpravami dostupnĂ˝mi pro oprĂˇvnÄ›nĂ© role.",
                points = listOf(
                    "ZobrazĂ­ seznam provoznĂ­ch hlĂˇĹˇenĂ­.",
                    "OtevĹ™e detail a Ăşpravu podle oprĂˇvnÄ›nĂ­ role.",
                    "DrĹľĂ­ jednotnĂ˝ tok pro recepci i navazujĂ­cĂ­ provoz.",
                ),
                actionLabel = "OtevĹ™Ă­t hlĂˇĹˇenĂ­",
                onAction = onReportsClick,
            )
        }
    }
}

@Composable
private fun TabletGridCell(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth(0.48f)) {
        content()
    }
}

@Composable
private fun ReceptionActionCard(
    title: String,
    subtitle: String,
    points: List<String>,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onAction),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(KajovoRadiusTokens.R12),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S3),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleLarge)
            Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
            Column(verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2)) {
                points.forEachIndexed { index, point ->
                    BulletLine(label = "${index + 1}.", value = point)
                }
            }
            Button(
                onClick = onAction,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(text = actionLabel)
            }
        }
    }
}
