package cz.hcasc.kajovohotel.core.designsystem

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import cz.hcasc.kajovohotel.core.common.PortalLocalization

@Composable
fun localize(source: String): String {
    val locale by PortalLocalization.locale.collectAsState()
    return remember(source, locale) { PortalLocalization.text(source, locale) }
}
