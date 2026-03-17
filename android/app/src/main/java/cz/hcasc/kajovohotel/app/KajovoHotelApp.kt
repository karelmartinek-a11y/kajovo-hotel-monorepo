package cz.hcasc.kajovohotel.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.platform.LocalUriHandler
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import cz.hcasc.kajovohotel.core.designsystem.KajovoTheme
import cz.hcasc.kajovohotel.core.designsystem.PortalChrome
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.AuthProfile
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.model.SessionState
import cz.hcasc.kajovohotel.feature.auth.login.LoginScreen
import cz.hcasc.kajovohotel.feature.auth.roles.RoleSelectionScreen
import cz.hcasc.kajovohotel.feature.breakfast.BreakfastScreen
import cz.hcasc.kajovohotel.feature.housekeeping.HousekeepingScreen
import cz.hcasc.kajovohotel.feature.inventory.InventoryScreen
import cz.hcasc.kajovohotel.feature.issues.IssuesScreen
import cz.hcasc.kajovohotel.feature.lostfound.LostFoundScreen
import cz.hcasc.kajovohotel.feature.profile.ChangePasswordScreen
import cz.hcasc.kajovohotel.feature.profile.ProfileScreen
import cz.hcasc.kajovohotel.feature.profile.ResetPasswordScreen
import cz.hcasc.kajovohotel.feature.reception.ReceptionHubScreen
import cz.hcasc.kajovohotel.feature.utility.AccessDeniedScreen
import cz.hcasc.kajovohotel.feature.utility.AppUpdatePromptScreen
import cz.hcasc.kajovohotel.feature.utility.GlobalBlockingErrorScreen
import cz.hcasc.kajovohotel.feature.utility.IntroScreen
import cz.hcasc.kajovohotel.feature.utility.MaintenanceScreen
import cz.hcasc.kajovohotel.feature.utility.NotFoundScreen
import cz.hcasc.kajovohotel.feature.utility.OfflineScreen

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
    val uriHandler = LocalUriHandler.current

    LaunchedEffect(Unit) {
        viewModel.restoreSession()
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
                onUpdateClick = { uriHandler.openUri(updateInfo.downloadUrl) },
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
                cz.hcasc.kajovohotel.core.model.BlockingUtilityState.OFFLINE -> OfflineScreen(onRetry = viewModel::restoreSession)
                cz.hcasc.kajovohotel.core.model.BlockingUtilityState.MAINTENANCE -> MaintenanceScreen(onBack = viewModel::restoreSession)
                cz.hcasc.kajovohotel.core.model.BlockingUtilityState.GLOBAL_BLOCKING_ERROR -> GlobalBlockingErrorScreen(onRetry = viewModel::restoreSession)
            }

            is SessionState.Authenticated -> {
                if (state.identity.requiresRoleSelection()) {
                    RoleSelectionScreen(
                        roles = state.identity.roles,
                        isBusy = false,
                        onConfirm = viewModel::selectRole,
                    )
                } else {
                    PortalAppShell(
                        identity = state.identity,
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
                    onLogout = onLogout,
                    onRoleChange = onRoleChange,
                    title = "Recepce",
                ) {
                    ReceptionHubScreen(
                        onBreakfastClick = { navController.navigate(PortalRoutes.Breakfast) },
                        onLostFoundClick = { navController.navigate(PortalRoutes.LostFound) },
                    )
                }
            }
            composable(PortalRoutes.Housekeeping) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Housekeeping,
                    navController = navController,
                    onLogout = onLogout,
                    onRoleChange = onRoleChange,
                    title = "Pokojská",
                ) {
                    HousekeepingScreen(role = identity.activeRole ?: PortalRole.HOUSEKEEPING, permissions = identity.permissions)
                }
            }
            composable(PortalRoutes.Breakfast) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Breakfast,
                    navController = navController,
                    onLogout = onLogout,
                    onRoleChange = onRoleChange,
                    title = "Snídaně",
                ) {
                    BreakfastScreen(activeRole = identity.activeRole ?: PortalRole.BREAKFAST)
                }
            }
            composable(PortalRoutes.LostFound) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.LostFound,
                    navController = navController,
                    onLogout = onLogout,
                    onRoleChange = onRoleChange,
                    title = "Ztráty a nálezy",
                ) {
                    LostFoundScreen()
                }
            }
            composable(PortalRoutes.Issues) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Issues,
                    navController = navController,
                    onLogout = onLogout,
                    onRoleChange = onRoleChange,
                    title = "Závady",
                ) {
                    IssuesScreen()
                }
            }
            composable(PortalRoutes.Inventory) {
                GuardedRoute(
                    identity = identity,
                    route = PortalRoutes.Inventory,
                    navController = navController,
                    onLogout = onLogout,
                    onRoleChange = onRoleChange,
                    title = "Sklad",
                ) {
                    InventoryScreen()
                }
            }
            composable(PortalRoutes.Profile) {
                PortalChrome(
                    title = "Profil",
                    roleLabel = identity.displayRole(),
                    onProfileClick = {},
                    onLogoutClick = onLogout,
                    onBackClick = navController.backActionOrNull(),
                    availableRoles = identity.roles,
                    activeRole = identity.activeRole,
                    onRoleSelected = onRoleChange,
                ) {
                    ProfileScreen(
                        profile = profile,
                        message = message,
                        onSave = onProfileSave,
                        onChangePasswordClick = { navController.navigate(PortalRoutes.ChangePassword) },
                    )
                }
            }
            composable(PortalRoutes.ChangePassword) {
                PortalChrome(
                    title = "Změna hesla",
                    roleLabel = identity.displayRole(),
                    onProfileClick = { navController.navigate(PortalRoutes.Profile) },
                    onLogoutClick = onLogout,
                    onBackClick = navController.backActionOrNull(),
                    availableRoles = identity.roles,
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
    onLogout: () -> Unit,
    onRoleChange: (PortalRole) -> Unit,
    title: String,
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
        onLogoutClick = onLogout,
        onBackClick = navController.backActionOrNull(),
        availableRoles = identity.roles,
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
