package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.network.dto.AndroidReleaseDto

data class AppUpdateInfo(
    val currentVersionCode: Int,
    val currentVersion: String,
    val latestVersionCode: Int,
    val latestVersion: String,
    val downloadUrl: String,
    val sha256: String,
    val title: String,
    val message: String,
    val required: Boolean,
)

data class AppUpdateState(
    val isChecking: Boolean = false,
    val availableUpdate: AppUpdateInfo? = null,
    val wasDismissed: Boolean = false,
    val pendingAutoStartVersionCode: Int? = null,
) {
    fun shouldPromptBeforeLogin(): Boolean = availableUpdate != null && !wasDismissed
}

fun AndroidReleaseDto.toAppUpdateInfo(currentVersionCode: Int, currentVersion: String): AppUpdateInfo = AppUpdateInfo(
    currentVersionCode = currentVersionCode,
    currentVersion = currentVersion,
    latestVersionCode = version_code,
    latestVersion = version,
    downloadUrl = download_url,
    sha256 = sha256,
    title = title,
    message = message,
    required = required,
)

fun isRemoteVersionNewer(currentVersionCode: Int, remoteVersionCode: Int): Boolean {
    return remoteVersionCode > currentVersionCode
}

fun isRemoteVersionNameNewer(currentVersion: String, remoteVersion: String): Boolean {
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
