package cz.hcasc.kajovohotel.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.NavHostController
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import cz.hcasc.kajovohotel.core.designsystem.KajovoTheme
import cz.hcasc.kajovohotel.core.designsystem.PortalChrome
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.AuthProfile
import cz.hcasc.kajovohotel.core.model.BlockingUtilityState
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.feature.auth.login.LoginScreen
import cz.hcasc.kajovohotel.feature.auth.roles.RoleSelectionScreen
import cz.hcasc.kajovohotel.feature.breakfast.BreakfastSection
import cz.hcasc.kajovohotel.feature.breakfast.BreakfastScreen
import cz.hcasc.kajovohotel.feature.housekeeping.HousekeepingScreen
import cz.hcasc.kajovohotel.feature.inventory.InventorySection
import cz.hcasc.kajovohotel.feature.inventory.InventoryScreen
import cz.hcasc.kajovohotel.feature.issues.IssuesSection
import cz.hcasc.kajovohotel.feature.issues.IssuesScreen
import cz.hcasc.kajovohotel.feature.lostfound.LostFoundSection
import cz.hcasc.kajovohotel.feature.lostfound.LostFoundScreen
import cz.hcasc.kajovohotel.feature.profile.ChangePasswordScreen
import cz.hcasc.kajovohotel.feature.profile.ProfileScreen
import cz.hcasc.kajovohotel.feature.profile.ResetPasswordScreen
import cz.hcasc.kajovohotel.feature.reception.ReceptionHubScreen
import cz.hcasc.kajovohotel.feature.reports.ReportsSection
import cz.hcasc.kajovohotel.feature.reports.ReportsScreen
import cz.hcasc.kajovohotel.feature.utility.AccessDeniedScreen
import cz.hcasc.kajovohotel.feature.utility.AppUpdatePromptScreen
import cz.hcasc.kajovohotel.feature.utility.GlobalBlockingErrorScreen
import cz.hcasc.kajovohotel.feature.utility.IntroScreen
import cz.hcasc.kajovohotel.feature.utility.MaintenanceScreen
import cz.hcasc.kajovohotel.feature.utility.NotFoundScreen
import cz.hcasc.kajovohotel.feature.utility.OfflineScreen
import kotlinx.coroutines.launch

@Composable
fun KajovoHotelApp(
    passwordResetToken: String? = null,
    onPasswordResetTokenConsumed: () -> Unit = {},
    viewModel: AppStateViewModel = hiltViewModel(),
) {
    val sessionState by viewModel.sessionState.collectAsStateWithLifecycle()
    val profile by viewModel.profile.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val appUpdateState by viewModel.appUpdateState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val appUpdater = remember(context) { AndroidAppUpdater(context) }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        viewModel.restoreSession()
    }
    LaunchedEffect(appUpdateState.pendingAutoStartVersionCode) {
        val updateInfo = appUpdateState.availableUpdate
        val targetVersion = appUpdateState.pendingAutoStartVersionCode
        if (updateInfo != null && targetVersion != null && updateInfo.latestVersionCode == targetVersion) {
            viewModel.consumePendingAutoStart(targetVersion)
            appUpdater.startBestEffortUpdate(updateInfo)
        }
    }

    KajovoTheme(darkTheme = isSystemInDarkTheme()) {
        val updateInfo = appUpdateState.availableUpdate
        if (sessionState !is SessionState.Authenticated && passwordResetToken != null) {
            ResetPasswordScreen(
                message = message,
                onSubmit = { password, _ -> viewModel.completePasswordReset(passwordResetToken, password, onPasswordResetTokenConsumed) },
                onBackToLogin = onPasswordResetTokenConsumed,
            )
            return@KajovoTheme
        }
        if (sessionState !is SessionState.Authenticated && updateInfo != null && appUpdateState.shouldPromptBeforeLogin()) {
            AppUpdatePromptScreen(
                title = updateInfo.title,
                message = updateInfo.message,
                latestVersion = updateInfo.latestVersion,
                onUpdateClick = {
                    viewModel.consumePendingAutoStart(updateInfo.latestVersionCode)
                    coroutineScope.launch { appUpdater.startBestEffortUpdate(updateInfo) }
                },
                onContinueClick = if (updateInfo.required) null else viewModel::dismissAppUpdate,
            )
            return@KajovoTheme
        }

        when (val state = sessionState) {
            SessionState.Checking -> IntroScreen()
            SessionState.Unauthenticated -> LoginScreen(
                isBusy = false,
                errorMessage = message,
                onSubmit = viewModel::signIn,
            )

            is SessionState.Failure -> when (state.utilityState) {
                BlockingUtilityState.OFFLINE -> OfflineScreen(onRetry = viewModel::restoreSession)
                BlockingUtilityState.MAINTENANCE -> MaintenanceScreen(onBack = viewModel::restoreSession)
                BlockingUtilityState.GLOBAL_BLOCKING_ERROR -> GlobalBlockingErrorScreen(onRetry = viewModel::restoreSession)
            }

            is SessionState.Authenticated -> {
                val assignedRoles = state.identity.assignedRoles()
                val activeRole = state.identity.resolvedActiveRole()
                if (assignedRoles.isEmpty()) {
                    AccessDeniedScreen(onBack = viewModel::logout)
                } else if (activeRole == null && assignedRoles.size > 1) {
                    RoleSelectionScreen(
                        roles = assignedRoles,
                        isBusy = false,
                        onConfirm = viewModel::selectRole,
                    )
                } else {
                    val navigationIdentity = state.identity.copy(
                        roles = assignedRoles,
                        activeRole = activeRole ?: assignedRoles.singleOrNull(),
                    )
                    PortalAppShell(
                        identity = navigationIdentity,
                        profile = profile,
                        message = message,
                        onRoleChange = viewModel::selectRole,
                        onProfileSave = viewModel::saveProfile,
                        onChangePassword = viewModel::changePassword,
                        onLogout = viewModel::logout,
                    )
                }
            }
        }
    }
}

@Composable
private fun PortalAppShell(
    identity: AuthenticatedIdentity,
    profile: AuthProfile?,
    message: String?,
    onRoleChange: (PortalRole) -> Unit,
    onProfileSave: (String, String, String, String) -> Unit,
    onChangePassword: (String, String) -> Unit,
    onLogout: () -> Unit,
) {
    val startRoute = resolveAuthenticatedRoute(identity)
    val availableRoles = identity.assignedRoles()

    key(identity.email, identity.activeRole, identity.permissions.sorted().joinToString()) {
        val navController = rememberNavController()
        NavHost(navController = navController, startDestination = startRoute) {
            composable(PortalRoutes.AccessDenied) {
                AccessDeniedScreen(onBack = onLogout)
            }
            composable(PortalRoutes.Reception) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Reception,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Recepce",
                    availableRoles = availableRoles,
                ) {
                    ReceptionHubScreen(
                        onBreakfastClick = { navController.navigate(PortalRoutes.Breakfast) },
                        onLostFoundClick = { navController.navigate(PortalRoutes.LostFound) },
                        onReportsClick = { navController.navigate(PortalRoutes.Reports) },
                    )
                }
            }
            composable(PortalRoutes.Housekeeping) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Housekeeping,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Pokojská",
                    availableRoles = availableRoles,
                ) {
                    HousekeepingScreen(
                        role = identity.activeRole ?: PortalRole.HOUSEKEEPING,
                        permissions = identity.permissions,
                    )
                }
            }
            composable(PortalRoutes.Breakfast) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Breakfast,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Snídaně",
                    availableRoles = availableRoles,
                ) {
                    BreakfastScreen(
                        activeRole = identity.activeRole ?: PortalRole.BREAKFAST,
                        initialSection = BreakfastSection.LIST,
                        onNavigate = { section, orderId ->
                            when (section) {
                                BreakfastSection.LIST -> navController.navigate(PortalRoutes.Breakfast)
                                BreakfastSection.CREATE -> navController.navigate(PortalRoutes.BreakfastCreate)
                                BreakfastSection.DETAIL -> orderId?.let { navController.navigate(PortalRoutes.breakfastDetail(it)) }
                                BreakfastSection.EDIT -> orderId?.let { navController.navigate(PortalRoutes.breakfastEdit(it)) }
                                BreakfastSection.IMPORT -> navController.navigate(PortalRoutes.Breakfast)
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.BreakfastDetail,
                arguments = listOf(navArgument("orderId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getInt("orderId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Breakfast,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Snídaně",
                    availableRoles = availableRoles,
                ) {
                    BreakfastScreen(
                        activeRole = identity.activeRole ?: PortalRole.BREAKFAST,
                        initialSection = BreakfastSection.DETAIL,
                        selectedOrderId = orderId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                BreakfastSection.LIST -> navController.navigate(PortalRoutes.Breakfast)
                                BreakfastSection.CREATE -> navController.navigate(PortalRoutes.BreakfastCreate)
                                BreakfastSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.breakfastDetail(it)) }
                                BreakfastSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.breakfastEdit(it)) }
                                BreakfastSection.IMPORT -> navController.navigate(PortalRoutes.Breakfast)
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.BreakfastCreate) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Breakfast,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Snídaně",
                    availableRoles = availableRoles,
                ) {
                    BreakfastScreen(
                        activeRole = identity.activeRole ?: PortalRole.BREAKFAST,
                        initialSection = BreakfastSection.CREATE,
                        onNavigate = { section, targetId ->
                            when (section) {
                                BreakfastSection.LIST -> navController.navigate(PortalRoutes.Breakfast)
                                BreakfastSection.CREATE -> navController.navigate(PortalRoutes.BreakfastCreate)
                                BreakfastSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.breakfastDetail(it)) }
                                BreakfastSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.breakfastEdit(it)) }
                                BreakfastSection.IMPORT -> navController.navigate(PortalRoutes.Breakfast)
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.BreakfastEdit,
                arguments = listOf(navArgument("orderId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getInt("orderId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Breakfast,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Snídaně",
                    availableRoles = availableRoles,
                ) {
                    BreakfastScreen(
                        activeRole = identity.activeRole ?: PortalRole.BREAKFAST,
                        initialSection = BreakfastSection.EDIT,
                        selectedOrderId = orderId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                BreakfastSection.LIST -> navController.navigate(PortalRoutes.Breakfast)
                                BreakfastSection.CREATE -> navController.navigate(PortalRoutes.BreakfastCreate)
                                BreakfastSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.breakfastDetail(it)) }
                                BreakfastSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.breakfastEdit(it)) }
                                BreakfastSection.IMPORT -> navController.navigate(PortalRoutes.Breakfast)
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.LostFound) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.LostFound,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Ztráty a nálezy",
                    availableRoles = availableRoles,
                ) {
                    LostFoundScreen(
                        activeRole = identity.activeRole ?: PortalRole.RECEPTION,
                        initialSection = LostFoundSection.LIST,
                        onNavigate = { section, recordId ->
                            when (section) {
                                LostFoundSection.LIST -> navController.navigate(PortalRoutes.LostFound)
                                LostFoundSection.CREATE -> navController.navigate(PortalRoutes.LostFoundCreate)
                                LostFoundSection.DETAIL -> recordId?.let { navController.navigate(PortalRoutes.lostFoundDetail(it)) }
                                LostFoundSection.EDIT -> recordId?.let { navController.navigate(PortalRoutes.lostFoundEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.LostFoundDetail,
                arguments = listOf(navArgument("recordId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val recordId = backStackEntry.arguments?.getInt("recordId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.LostFound,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Ztráty a nálezy",
                    availableRoles = availableRoles,
                ) {
                    LostFoundScreen(
                        activeRole = identity.activeRole ?: PortalRole.RECEPTION,
                        initialSection = LostFoundSection.DETAIL,
                        selectedRecordId = recordId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                LostFoundSection.LIST -> navController.navigate(PortalRoutes.LostFound)
                                LostFoundSection.CREATE -> navController.navigate(PortalRoutes.LostFoundCreate)
                                LostFoundSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.lostFoundDetail(it)) }
                                LostFoundSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.lostFoundEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.LostFoundCreate) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.LostFound,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Ztráty a nálezy",
                    availableRoles = availableRoles,
                ) {
                    LostFoundScreen(
                        activeRole = identity.activeRole ?: PortalRole.RECEPTION,
                        initialSection = LostFoundSection.CREATE,
                        onNavigate = { section, targetId ->
                            when (section) {
                                LostFoundSection.LIST -> navController.navigate(PortalRoutes.LostFound)
                                LostFoundSection.CREATE -> navController.navigate(PortalRoutes.LostFoundCreate)
                                LostFoundSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.lostFoundDetail(it)) }
                                LostFoundSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.lostFoundEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.LostFoundEdit,
                arguments = listOf(navArgument("recordId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val recordId = backStackEntry.arguments?.getInt("recordId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.LostFound,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Ztráty a nálezy",
                    availableRoles = availableRoles,
                ) {
                    LostFoundScreen(
                        activeRole = identity.activeRole ?: PortalRole.RECEPTION,
                        initialSection = LostFoundSection.EDIT,
                        selectedRecordId = recordId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                LostFoundSection.LIST -> navController.navigate(PortalRoutes.LostFound)
                                LostFoundSection.CREATE -> navController.navigate(PortalRoutes.LostFoundCreate)
                                LostFoundSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.lostFoundDetail(it)) }
                                LostFoundSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.lostFoundEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.Issues) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Issues,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Závady",
                    availableRoles = availableRoles,
                ) {
                    IssuesScreen(
                        initialSection = IssuesSection.LIST,
                        onNavigate = { section, issueId ->
                            when (section) {
                                IssuesSection.LIST -> navController.navigate(PortalRoutes.Issues)
                                IssuesSection.CREATE -> navController.navigate(PortalRoutes.IssuesCreate)
                                IssuesSection.DETAIL -> issueId?.let { navController.navigate(PortalRoutes.issuesDetail(it)) }
                                IssuesSection.EDIT -> issueId?.let { navController.navigate(PortalRoutes.issuesEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.IssuesDetail,
                arguments = listOf(navArgument("issueId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val issueId = backStackEntry.arguments?.getInt("issueId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Issues,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Závady",
                    availableRoles = availableRoles,
                ) {
                    IssuesScreen(
                        initialSection = IssuesSection.DETAIL,
                        selectedIssueId = issueId,
                        onNavigate = { section, id ->
                            when (section) {
                                IssuesSection.LIST -> navController.navigate(PortalRoutes.Issues)
                                IssuesSection.CREATE -> navController.navigate(PortalRoutes.IssuesCreate)
                                IssuesSection.DETAIL -> id?.let { navController.navigate(PortalRoutes.issuesDetail(it)) }
                                IssuesSection.EDIT -> id?.let { navController.navigate(PortalRoutes.issuesEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.IssuesCreate) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Issues,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Závady",
                    availableRoles = availableRoles,
                ) {
                    IssuesScreen(
                        initialSection = IssuesSection.CREATE,
                        onNavigate = { section, id ->
                            when (section) {
                                IssuesSection.LIST -> navController.navigate(PortalRoutes.Issues)
                                IssuesSection.CREATE -> navController.navigate(PortalRoutes.IssuesCreate)
                                IssuesSection.DETAIL -> id?.let { navController.navigate(PortalRoutes.issuesDetail(it)) }
                                IssuesSection.EDIT -> id?.let { navController.navigate(PortalRoutes.issuesEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.IssuesEdit,
                arguments = listOf(navArgument("issueId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val issueId = backStackEntry.arguments?.getInt("issueId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Issues,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Závady",
                    availableRoles = availableRoles,
                ) {
                    IssuesScreen(
                        initialSection = IssuesSection.EDIT,
                        selectedIssueId = issueId,
                        onNavigate = { section, id ->
                            when (section) {
                                IssuesSection.LIST -> navController.navigate(PortalRoutes.Issues)
                                IssuesSection.CREATE -> navController.navigate(PortalRoutes.IssuesCreate)
                                IssuesSection.DETAIL -> id?.let { navController.navigate(PortalRoutes.issuesDetail(it)) }
                                IssuesSection.EDIT -> id?.let { navController.navigate(PortalRoutes.issuesEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.Inventory) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Inventory,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Sklad",
                    availableRoles = availableRoles,
                ) {
                    InventoryScreen(
                        onReportsClick = if (identity.permissions.contains("reports:read")) {
                            { navController.navigate(PortalRoutes.Reports) }
                        } else {
                            null
                        },
                        initialSection = InventorySection.LIST,
                        onNavigate = { section, itemId ->
                            when (section) {
                                InventorySection.LIST -> navController.navigate(PortalRoutes.Inventory)
                                InventorySection.CREATE -> navController.navigate(PortalRoutes.InventoryCreate)
                                InventorySection.DETAIL -> itemId?.let { navController.navigate(PortalRoutes.inventoryDetail(it)) }
                                InventorySection.EDIT -> itemId?.let { navController.navigate(PortalRoutes.inventoryEdit(it)) }
                                InventorySection.MOVEMENT -> itemId?.let { navController.navigate(PortalRoutes.inventoryMovement(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.InventoryDetail,
                arguments = listOf(navArgument("itemId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val itemId = backStackEntry.arguments?.getInt("itemId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Inventory,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Sklad",
                    availableRoles = availableRoles,
                ) {
                    InventoryScreen(
                        onReportsClick = if (identity.permissions.contains("reports:read")) {
                            { navController.navigate(PortalRoutes.Reports) }
                        } else {
                            null
                        },
                        initialSection = InventorySection.DETAIL,
                        selectedItemId = itemId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                InventorySection.LIST -> navController.navigate(PortalRoutes.Inventory)
                                InventorySection.CREATE -> navController.navigate(PortalRoutes.InventoryCreate)
                                InventorySection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.inventoryDetail(it)) }
                                InventorySection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.inventoryEdit(it)) }
                                InventorySection.MOVEMENT -> targetId?.let { navController.navigate(PortalRoutes.inventoryMovement(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.InventoryCreate) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Inventory,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Sklad",
                    availableRoles = availableRoles,
                ) {
                    InventoryScreen(
                        onReportsClick = if (identity.permissions.contains("reports:read")) {
                            { navController.navigate(PortalRoutes.Reports) }
                        } else {
                            null
                        },
                        initialSection = InventorySection.CREATE,
                        onNavigate = { section, targetId ->
                            when (section) {
                                InventorySection.LIST -> navController.navigate(PortalRoutes.Inventory)
                                InventorySection.CREATE -> navController.navigate(PortalRoutes.InventoryCreate)
                                InventorySection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.inventoryDetail(it)) }
                                InventorySection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.inventoryEdit(it)) }
                                InventorySection.MOVEMENT -> targetId?.let { navController.navigate(PortalRoutes.inventoryMovement(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.InventoryEdit,
                arguments = listOf(navArgument("itemId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val itemId = backStackEntry.arguments?.getInt("itemId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Inventory,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Sklad",
                    availableRoles = availableRoles,
                ) {
                    InventoryScreen(
                        onReportsClick = if (identity.permissions.contains("reports:read")) {
                            { navController.navigate(PortalRoutes.Reports) }
                        } else {
                            null
                        },
                        initialSection = InventorySection.EDIT,
                        selectedItemId = itemId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                InventorySection.LIST -> navController.navigate(PortalRoutes.Inventory)
                                InventorySection.CREATE -> navController.navigate(PortalRoutes.InventoryCreate)
                                InventorySection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.inventoryDetail(it)) }
                                InventorySection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.inventoryEdit(it)) }
                                InventorySection.MOVEMENT -> targetId?.let { navController.navigate(PortalRoutes.inventoryMovement(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.InventoryMovement,
                arguments = listOf(navArgument("itemId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val itemId = backStackEntry.arguments?.getInt("itemId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Inventory,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Sklad",
                    availableRoles = availableRoles,
                ) {
                    InventoryScreen(
                        onReportsClick = if (identity.permissions.contains("reports:read")) {
                            { navController.navigate(PortalRoutes.Reports) }
                        } else {
                            null
                        },
                        initialSection = InventorySection.MOVEMENT,
                        selectedItemId = itemId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                InventorySection.LIST -> navController.navigate(PortalRoutes.Inventory)
                                InventorySection.CREATE -> navController.navigate(PortalRoutes.InventoryCreate)
                                InventorySection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.inventoryDetail(it)) }
                                InventorySection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.inventoryEdit(it)) }
                                InventorySection.MOVEMENT -> targetId?.let { navController.navigate(PortalRoutes.inventoryMovement(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.Reports) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Reports,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Hlášení",
                    availableRoles = availableRoles,
                ) {
                    ReportsScreen(
                        canManageReports = identity.permissions.contains("reports:write"),
                        initialSection = ReportsSection.LIST,
                        onNavigate = { section, reportId ->
                            when (section) {
                                ReportsSection.LIST -> navController.navigate(PortalRoutes.Reports)
                                ReportsSection.CREATE -> navController.navigate(PortalRoutes.ReportsCreate)
                                ReportsSection.DETAIL -> reportId?.let { navController.navigate(PortalRoutes.reportsDetail(it)) }
                                ReportsSection.EDIT -> reportId?.let { navController.navigate(PortalRoutes.reportsEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.ReportsDetail,
                arguments = listOf(navArgument("reportId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val reportId = backStackEntry.arguments?.getInt("reportId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Reports,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Hlášení",
                    availableRoles = availableRoles,
                ) {
                    ReportsScreen(
                        canManageReports = identity.permissions.contains("reports:write"),
                        initialSection = ReportsSection.DETAIL,
                        selectedReportId = reportId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                ReportsSection.LIST -> navController.navigate(PortalRoutes.Reports)
                                ReportsSection.CREATE -> navController.navigate(PortalRoutes.ReportsCreate)
                                ReportsSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.reportsDetail(it)) }
                                ReportsSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.reportsEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.ReportsCreate) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Reports,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Hlášení",
                    availableRoles = availableRoles,
                ) {
                    ReportsScreen(
                        canManageReports = identity.permissions.contains("reports:write"),
                        initialSection = ReportsSection.CREATE,
                        onNavigate = { section, targetId ->
                            when (section) {
                                ReportsSection.LIST -> navController.navigate(PortalRoutes.Reports)
                                ReportsSection.CREATE -> navController.navigate(PortalRoutes.ReportsCreate)
                                ReportsSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.reportsDetail(it)) }
                                ReportsSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.reportsEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(
                route = PortalRoutes.ReportsEdit,
                arguments = listOf(navArgument("reportId") { type = NavType.IntType }),
            ) { backStackEntry ->
                val reportId = backStackEntry.arguments?.getInt("reportId")
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Reports,
                    navController = navController,
                    onRoleChange = onRoleChange,
                    title = "Hlášení",
                    availableRoles = availableRoles,
                ) {
                    ReportsScreen(
                        canManageReports = identity.permissions.contains("reports:write"),
                        initialSection = ReportsSection.EDIT,
                        selectedReportId = reportId,
                        onNavigate = { section, targetId ->
                            when (section) {
                                ReportsSection.LIST -> navController.navigate(PortalRoutes.Reports)
                                ReportsSection.CREATE -> navController.navigate(PortalRoutes.ReportsCreate)
                                ReportsSection.DETAIL -> targetId?.let { navController.navigate(PortalRoutes.reportsDetail(it)) }
                                ReportsSection.EDIT -> targetId?.let { navController.navigate(PortalRoutes.reportsEdit(it)) }
                            }
                        },
                    )
                }
            }
            composable(PortalRoutes.Profile) {
                PortalChrome(
                    title = "Profil",
                    roleLabel = identity.displayRole(),
                    onProfileClick = {},
                    onBackClick = navController.backActionOrNull(),
                    availableRoles = availableRoles,
                    activeRole = identity.activeRole,
                    onRoleSelected = onRoleChange,
                ) {
                    ProfileScreen(
                        profile = profile,
                        message = message,
                        onSave = onProfileSave,
                        onChangePasswordClick = { navController.navigate(PortalRoutes.ChangePassword) },
                        onLogoutClick = onLogout,
                    )
                }
            }
            composable(PortalRoutes.ChangePassword) {
                PortalChrome(
                    title = "Změna hesla",
                    roleLabel = identity.displayRole(),
                    onProfileClick = { navController.navigate(PortalRoutes.Profile) },
                    onBackClick = navController.backActionOrNull(),
                    availableRoles = availableRoles,
                    activeRole = identity.activeRole,
                    onRoleSelected = onRoleChange,
                ) {
                    ChangePasswordScreen(message = message, onSubmit = onChangePassword)
                }
            }
            composable(PortalRoutes.Offline) { OfflineScreen(onRetry = { navController.popBackStack() }) }
            composable(PortalRoutes.Maintenance) { MaintenanceScreen(onBack = { navController.popBackStack() }) }
            composable(PortalRoutes.NotFound) { NotFoundScreen(onBack = { navController.popBackStack() }) }
            composable(PortalRoutes.GlobalError) { GlobalBlockingErrorScreen(onRetry = { navController.popBackStack() }) }
        }
    }
}

@Composable
private fun GuardedRoute(
    identity: AuthenticatedIdentity,
    route: String,
    navController: NavHostController,
    onRoleChange: (PortalRole) -> Unit,
    title: String,
    availableRoles: List<PortalRole>,
    content: @Composable () -> Unit,
) {
    if (!identity.canOpenDestination(route)) {
        AccessDeniedScreen(onBack = { navController.navigate(resolveAuthenticatedRoute(identity)) })
        return
    }
    PortalChrome(
        title = title,
        roleLabel = identity.displayRole(),
        onProfileClick = { navController.navigate(PortalRoutes.Profile) },
        onBackClick = navController.backActionOrNull(),
        availableRoles = availableRoles,
        activeRole = identity.activeRole,
        onRoleSelected = onRoleChange,
        content = content,
    )
}

private fun NavHostController.backActionOrNull(): (() -> Unit)? {
    return if (previousBackStackEntry != null) {
        { popBackStack() }
    } else {
        null
    }
}
