package cz.hcasc.kajovohotel.core.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens

enum class KajovoDeviceLayout {
    COMPACT,
    TABLET,
}

@Composable
fun rememberKajovoDeviceLayout(): KajovoDeviceLayout {
    val configuration = LocalConfiguration.current
    return if (configuration.screenWidthDp >= 840) {
        KajovoDeviceLayout.TABLET
    } else {
        KajovoDeviceLayout.COMPACT
    }
}

@Composable
fun AdaptiveSplitLayout(
    modifier: Modifier = Modifier,
    primaryWeight: Float = 1f,
    secondaryWeight: Float = 1f,
    primaryPane: @Composable () -> Unit,
    secondaryPane: @Composable () -> Unit,
) {
    Row(
        modifier = modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
    ) {
        AdaptivePane(
            modifier = Modifier.weight(primaryWeight),
            content = primaryPane,
        )
        AdaptivePane(
            modifier = Modifier.weight(secondaryWeight),
            content = secondaryPane,
        )
    }
}

@Composable
fun AdaptiveTwoColumnBlock(
    modifier: Modifier = Modifier,
    leadingWeight: Float = 1f,
    trailingWeight: Float = 1f,
    leading: @Composable () -> Unit,
    trailing: @Composable () -> Unit,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
    ) {
        Column(
            modifier = Modifier.weight(leadingWeight),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
        ) {
            leading()
        }
        Column(
            modifier = Modifier.weight(trailingWeight),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4),
        ) {
            trailing()
        }
    }
}

@Composable
private fun AdaptivePane(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.fillMaxSize(),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(KajovoRadiusTokens.R16),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(KajovoSpacingTokens.S4),
        ) {
            content()
        }
    }
}
