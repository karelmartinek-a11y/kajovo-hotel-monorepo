package cz.hcasc.kajovohotel.core.common

data class BinaryPayload(
    val fileName: String,
    val mimeType: String,
    val bytes: ByteArray,
)
