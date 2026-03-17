package cz.hcasc.kajovohotel.core.model

enum class PortalRole(val wireValue: String, val displayName: String) {
    RECEPTION("recepce", "Recepce"),
    HOUSEKEEPING("pokojská", "Pokojská"),
    MAINTENANCE("údržba", "Údržba"),
    BREAKFAST("snídaně", "Snídaně"),
    INVENTORY("sklad", "Sklad");

    companion object {
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

        fun fromWire(raw: String?): PortalRole? = aliases[raw?.trim()?.lowercase()]
    }
}
