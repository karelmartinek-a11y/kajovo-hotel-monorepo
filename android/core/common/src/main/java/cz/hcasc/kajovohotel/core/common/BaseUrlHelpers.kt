package cz.hcasc.kajovohotel.core.common

fun BaseUrlConfig.resolveApiPath(path: String): String {
    val normalizedBase = value.trimEnd('/')
    val normalizedPath = if (path.startsWith('/')) path else "/$path"
    return normalizedBase + normalizedPath
}
