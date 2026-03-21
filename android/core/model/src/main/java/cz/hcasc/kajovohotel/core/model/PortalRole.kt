package cz.hcasc.kajovohotel.core.model

import java.nio.charset.Charset

enum class PortalRole(val wireValue: String, val displayName: String) {
    RECEPTION("recepce", "Recepce"),
    HOUSEKEEPING("pokojská", "Pokojská"),
    MAINTENANCE("údržba", "Údržba"),
    BREAKFAST("snídaně", "Snídaně"),
    INVENTORY("sklad", "Sklad");

    companion object {
        private val encodingDriftRepairs = mapOf(
            "pokojskĂˇ" to "pokojská",
            "pokojskăˇ" to "pokojská",
            "ĂşdrĹľba" to "údržba",
            "ăşdrľžba" to "údržba",
            "snĂ­danÄ›" to "snídaně",
        )

        private val aliases = mapOf(
            "recepce" to RECEPTION,
            "reception" to RECEPTION,
            "pokojska" to HOUSEKEEPING,
            "pokojská" to HOUSEKEEPING,
            "housekeeping" to HOUSEKEEPING,
            "udrzba" to MAINTENANCE,
            "údržba" to MAINTENANCE,
            "maintenance" to MAINTENANCE,
            "snidane" to BREAKFAST,
            "snídaně" to BREAKFAST,
            "breakfast" to BREAKFAST,
            "sklad" to INVENTORY,
            "warehouse" to INVENTORY,
            "inventory" to INVENTORY,
        )

        fun fromWire(raw: String?): PortalRole? {
            val normalized = normalizeWireValue(raw) ?: return null
            return aliases[normalized]
        }

        private fun normalizeWireValue(raw: String?): String? {
            val trimmed = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val direct = trimmed.lowercase()
            if (aliases.containsKey(direct)) {
                return direct
            }
            return repairEncodingDrift(trimmed)
        }

        private fun repairEncodingDrift(value: String): String? {
            encodingDriftRepairs[value]?.lowercase()?.let { repaired ->
                if (aliases.containsKey(repaired)) {
                    return repaired
                }
            }
            listOf("windows-1250", "ISO-8859-1").forEach { sourceEncoding ->
                val candidate = decodeEncodingDrift(value, sourceEncoding)
                val normalizedCandidate = candidate?.lowercase()
                if (normalizedCandidate != null && normalizedCandidate != value.lowercase() && aliases.containsKey(normalizedCandidate)) {
                    return normalizedCandidate
                }
            }
            return value.lowercase()
        }

        private fun decodeEncodingDrift(value: String, sourceEncoding: String): String? = try {
            String(value.toByteArray(Charset.forName(sourceEncoding)), Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }
}
