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
    const val BreakfastDetail = "snidane/detail/{orderId}"
    const val BreakfastCreate = "snidane/nove"
    const val BreakfastEdit = "snidane/edit/{orderId}"
    const val LostFound = "ztraty-a-nalezy"
    const val LostFoundDetail = "ztraty-a-nalezy/detail/{recordId}"
    const val LostFoundCreate = "ztraty-a-nalezy/nove"
    const val LostFoundEdit = "ztraty-a-nalezy/edit/{recordId}"
    const val Issues = "zavady"
    const val IssuesDetail = "zavady/detail/{issueId}"
    const val IssuesCreate = "zavady/nove"
    const val IssuesEdit = "zavady/edit/{issueId}"
    const val Inventory = "sklad"
    const val InventoryDetail = "sklad/detail/{itemId}"
    const val InventoryCreate = "sklad/nove"
    const val InventoryEdit = "sklad/edit/{itemId}"
    const val InventoryMovement = "sklad/pohyb/{itemId}"
    const val Reports = "hlaseni"
    const val ReportsDetail = "hlaseni/detail/{reportId}"
    const val ReportsCreate = "hlaseni/nove"
    const val ReportsEdit = "hlaseni/edit/{reportId}"
    const val Profile = "profil"
    const val ChangePassword = "zmena-hesla"

    fun issuesDetail(issueId: Int): String = "zavady/detail/$issueId"
    fun issuesEdit(issueId: Int): String = "zavady/edit/$issueId"
    fun breakfastDetail(orderId: Int): String = "snidane/detail/$orderId"
    fun breakfastEdit(orderId: Int): String = "snidane/edit/$orderId"
    fun lostFoundDetail(recordId: Int): String = "ztraty-a-nalezy/detail/$recordId"
    fun lostFoundEdit(recordId: Int): String = "ztraty-a-nalezy/edit/$recordId"
    fun inventoryDetail(itemId: Int): String = "sklad/detail/$itemId"
    fun inventoryEdit(itemId: Int): String = "sklad/edit/$itemId"
    fun inventoryMovement(itemId: Int): String = "sklad/pohyb/$itemId"
    fun reportsDetail(reportId: Int): String = "hlaseni/detail/$reportId"
    fun reportsEdit(reportId: Int): String = "hlaseni/edit/$reportId"
}

data class PortalDestination(
    val route: String,
    val title: String,
    val module: HotelModule?,
    val allowedRoles: Set<PortalRole>,
)

val PortalDestinations = listOf(
    PortalDestination(PortalRoutes.Reception, "Recepce", null, setOf(PortalRole.RECEPTION)),
    PortalDestination(PortalRoutes.Housekeeping, "Pokojská", HotelModule.HOUSEKEEPING, setOf(PortalRole.HOUSEKEEPING)),
    PortalDestination(PortalRoutes.Breakfast, "Snídaně", HotelModule.BREAKFAST, setOf(PortalRole.RECEPTION, PortalRole.BREAKFAST)),
    PortalDestination(PortalRoutes.LostFound, "Ztráty a nálezy", HotelModule.LOST_FOUND, setOf(PortalRole.RECEPTION)),
    PortalDestination(PortalRoutes.Issues, "Závady", HotelModule.ISSUES, setOf(PortalRole.MAINTENANCE)),
    PortalDestination(PortalRoutes.Inventory, "Sklad", HotelModule.INVENTORY, setOf(PortalRole.INVENTORY)),
    PortalDestination(PortalRoutes.Reports, "Hlášení", HotelModule.REPORTS, setOf(PortalRole.RECEPTION, PortalRole.INVENTORY)),
)

fun PortalRole.homeRoute(): String = when (this) {
    PortalRole.RECEPTION -> PortalRoutes.Reception
    PortalRole.HOUSEKEEPING -> PortalRoutes.Housekeeping
    PortalRole.MAINTENANCE -> PortalRoutes.Issues
    PortalRole.BREAKFAST -> PortalRoutes.Breakfast
    PortalRole.INVENTORY -> PortalRoutes.Inventory
}
