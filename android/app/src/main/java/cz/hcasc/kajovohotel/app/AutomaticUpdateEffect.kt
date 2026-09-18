package cz.hcasc.kajovohotel.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect

@Composable
internal fun AutomaticUpdateEffect(
    state: AppUpdateState,
    onConsumed: (Int) -> Unit,
    onUpdate: suspend (AppUpdateInfo) -> Unit,
) {
    LaunchedEffect(state.pendingAutoStartVersionCode) {
        val updateInfo = state.availableUpdate
        val targetVersion = state.pendingAutoStartVersionCode
        if (updateInfo != null && targetVersion != null && updateInfo.latestVersionCode == targetVersion) {
            onUpdate(updateInfo)
            onConsumed(targetVersion)
        }
    }
}
