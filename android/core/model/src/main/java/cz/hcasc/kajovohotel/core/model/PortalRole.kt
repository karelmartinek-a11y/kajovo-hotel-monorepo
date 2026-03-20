package cz.hcasc.kajovohotel.core.model

enum class PortalRole(val wireValue: String, val displayName: String) {
    RECEPTION("recepce", "Recepce"),
    HOUSEKEEPING("pokojsk\u00E1", "Pokojsk\u00E1"),
    MAINTENANCE("\u00FAdr\u017Eba", "\u00DAdr\u017Eba"),
    BREAKFAST("sn\u00EDdan\u011B", "Sn\u00EDdan\u011B"),
    INVENTORY("sklad", "Sklad");

    companion object {
        private val aliases = mapOf(
            "recepce" to RECEPTION,
            "reception" to RECEPTION,
            "pokojska" to HOUSEKEEPING,
            "pokojsk\u00E1" to HOUSEKEEPING,
            "housekeeping" to HOUSEKEEPING,
            "udrzba" to MAINTENANCE,
            "\u00FAdr\u017Eba" to MAINTENANCE,
            "maintenance" to MAINTENANCE,
            "snidane" to BREAKFAST,
            "sn\u00EDdan\u011B" to BREAKFAST,
            "breakfast" to BREAKFAST,
            "sklad" to INVENTORY,
            "warehouse" to INVENTORY,
            "inventory" to INVENTORY,
        )

        fun fromWire(raw: String?): PortalRole? = aliases[raw?.trim()?.lowercase()]
    }
}
