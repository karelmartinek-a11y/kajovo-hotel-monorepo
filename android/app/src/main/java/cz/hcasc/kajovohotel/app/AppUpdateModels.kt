package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.network.dto.AndroidReleaseDto

data class AppUpdateInfo(
    val currentVersion: String,
    val latestVersion: String,
    val downloadUrl: String,
    val title: String,
    val message: String,
    val required: Boolean,
)

data class AppUpdateState(
    val isChecking: Boolean = false,
    val availableUpdate: AppUpdateInfo? = null,
    val wasDismissed: Boolean = false,
) {
    fun shouldPromptBeforeLogin(): Boolean = availableUpdate != null && !wasDismissed
}

fun AndroidReleaseDto.toAppUpdateInfo(currentVersion: String): AppUpdateInfo = AppUpdateInfo(
    currentVersion = currentVersion,
    latestVersion = version,
    downloadUrl = download_url,
    title = title,
    message = message,
    required = required,
)

fun isRemoteVersionNewer(currentVersion: String, remoteVersion: String): Boolean {
    val currentParts = currentVersion.split('.', '-', '_')
    val remoteParts = remoteVersion.split('.', '-', '_')
    val maxSize = maxOf(currentParts.size, remoteParts.size)

    for (index in 0 until maxSize) {
        val currentPart = currentParts.getOrNull(index).orEmpty()
        val remotePart = remoteParts.getOrNull(index).orEmpty()
        val currentNumber = currentPart.toIntOrNull()
        val remoteNumber = remotePart.toIntOrNull()

        val comparison = when {
            currentNumber != null && remoteNumber != null -> currentNumber.compareTo(remoteNumber)
            else -> currentPart.compareTo(remotePart)
        }
        if (comparison != 0) {
            return comparison < 0
        }
    }
    return false
}
