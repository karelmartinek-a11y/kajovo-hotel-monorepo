package cz.hcasc.kajovohotel.app

import cz.hcasc.kajovohotel.core.model.HotelModule
import cz.hcasc.kajovohotel.core.model.PortalRole

object PortalRoutes {
    const val Login = "login"
    const val Roles = "roles"
    const val Intro = "intro"
    const val Offline = "offline"
    const val Maintenance = "maintenance"
    const val NotFound = "not_found"
    const val AccessDenied = "access_denied"
    const val GlobalError = "global_error"
    const val Reception = "recepce"
    const val Housekeeping = "pokojska"
    const val Breakfast = "snidane"
    const val LostFound = "ztraty-a-nalezy"
    const val Issues = "zavady"
    const val Inventory = "sklad"
    const val Profile = "profil"
    const val ChangePassword = "zmena-hesla"
}

data class PortalDestination(val route: String, val title: String, val module: HotelModule?, val allowedRoles: Set<PortalRole>)

val PortalDestinations = listOf(
    PortalDestination(PortalRoutes.Reception, "Recepce", null, setOf(PortalRole.RECEPTION)),
    PortalDestination(PortalRoutes.Housekeeping, "Pokojská", HotelModule.HOUSEKEEPING, setOf(PortalRole.HOUSEKEEPING)),
    PortalDestination(PortalRoutes.Breakfast, "Snídaně", HotelModule.BREAKFAST, setOf(PortalRole.RECEPTION, PortalRole.BREAKFAST)),
    PortalDestination(PortalRoutes.LostFound, "Ztráty a nálezy", HotelModule.LOST_FOUND, setOf(PortalRole.RECEPTION)),
    PortalDestination(PortalRoutes.Issues, "Závady", HotelModule.ISSUES, setOf(PortalRole.MAINTENANCE)),
    PortalDestination(PortalRoutes.Inventory, "Sklad", HotelModule.INVENTORY, setOf(PortalRole.INVENTORY)),
)

fun PortalRole.homeRoute(): String = when (this) {
    PortalRole.RECEPTION -> PortalRoutes.Reception
    PortalRole.HOUSEKEEPING -> PortalRoutes.Housekeeping
    PortalRole.MAINTENANCE -> PortalRoutes.Issues
    PortalRole.BREAKFAST -> PortalRoutes.Breakfast
    PortalRole.INVENTORY -> PortalRoutes.Inventory
}
