package cz.hcasc.kajovohotel.core.designsystem

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.common.Branding
import cz.hcasc.kajovohotel.core.model.PortalRole
import cz.hcasc.kajovohotel.core.common.PortalLocalization

val LocalPortalLogout = staticCompositionLocalOf<() -> Unit> { {} }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortalChrome(
    title: String,
    roleLabel: String,
    onProfileClick: () -> Unit,
    onBackClick: (() -> Unit)? = null,
    availableRoles: List<PortalRole> = emptyList(),
    activeRole: PortalRole? = null,
    onRoleSelected: ((PortalRole) -> Unit)? = null,
    sections: List<Pair<String, String>> = emptyList(),
    onSectionSelected: ((String) -> Unit)? = null,
    selectedSection: String? = null,
    unreadChatCount: Int = 0,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val locale by PortalLocalization.locale.collectAsState()
    val logout = LocalPortalLogout.current
    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            Surface(color = cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.SurfaceRaised, shadowElevation = 2.dp) {
                Row(
                    Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Image(
                        painterResource(R.drawable.kajovo_full_logo), Branding.APP_NAME,
                        Modifier.width(132.dp).height(44.dp).background(
                            cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.SurfaceRaised, RoundedCornerShape(6.dp)),
                        contentScale = ContentScale.Fit,
                    )
                    Spacer(Modifier.weight(1f))
                    listOf("cs" to "🇨🇿", "en" to "🇬🇧", "uk" to "🇺🇦").forEach { (code, flag) ->
                        val selected = locale == code
                        Surface(
                            onClick = { PortalLocalization.setLocale(context, code) },
                            shape = RoundedCornerShape(8.dp),
                            color = if (selected) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                            ),
                        ) {
                            Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                                Text(flag, style = MaterialTheme.typography.titleMedium)
                            }
                        }
                    }
                    IconButton(onClick = logout, modifier = Modifier.size(40.dp)) {
                        Icon(Icons.Outlined.Logout, contentDescription = localize("Odhlásit"), tint = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        },
        bottomBar = {
            if (sections.isNotEmpty() && onSectionSelected != null) {
                Surface(tonalElevation = 0.dp, color = cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.SurfaceRaised) {
                    Row(
                        Modifier.fillMaxWidth().height(72.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 2.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        sections.forEach { (route, label) ->
                            val selected = route == selectedSection
                            Surface(
                                onClick = { onSectionSelected(route) },
                                modifier = Modifier.widthIn(min = 68.dp).height(56.dp).padding(horizontal = 1.dp),
                                shape = RoundedCornerShape(6.dp),
                                color = if (selected) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Transparent,
                            ) {
                                Column(
                                    Modifier.fillMaxSize().padding(horizontal = 3.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    if (route == "chat") {
                                        Icon(sectionIcon(route), contentDescription = null, modifier = Modifier.size(25.dp), tint = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                                    } else {
                                        Image(painterResource(sectionPictogram(route)), null, Modifier.size(28.dp), contentScale = ContentScale.Fit)
                                    }
                                    Text(localize(label), maxLines = 1, style = MaterialTheme.typography.labelSmall, color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                                    if (route == "chat" && unreadChatCount > 0) {
                                        Badge { Text(unreadChatCount.coerceAtMost(99).toString()) }
                                    }
                                }
                            }
                        }
                        val selected = selectedSection == "profil"
                        Surface(
                            onClick = onProfileClick,
                            modifier = Modifier.widthIn(min = 68.dp).height(56.dp).padding(horizontal = 1.dp),
                            shape = RoundedCornerShape(6.dp),
                            color = if (selected) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Transparent,
                        ) {
                            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Image(painterResource(R.drawable.portal_tab_profile), null, Modifier.size(28.dp), contentScale = ContentScale.Fit)
                                Text(localize("Profil"), maxLines = 1, style = MaterialTheme.typography.labelSmall, color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().background(cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.Surface).padding(padding).imePadding().padding(horizontal = 8.dp, vertical = 4.dp)) {
            content()
        }
    }
}

private fun sectionPictogram(route: String): Int = when (route.substringBefore('/')) {
    "pokojska" -> R.drawable.portal_tab_rooms
    "recepce" -> R.drawable.portal_tab_reception
    "snidane" -> R.drawable.portal_tab_breakfast
    "ztraty-a-nalezy" -> R.drawable.portal_tab_lostfound
    "zavady" -> R.drawable.portal_tab_maintenance
    "sklad" -> R.drawable.portal_tab_inventory
    "hlaseni" -> R.drawable.portal_tab_reports
    else -> R.drawable.portal_tab_rooms
}

private fun sectionIcon(route: String) = when (route.substringBefore('/')) {
    "chat" -> Icons.Outlined.ChatBubbleOutline
    else -> Icons.Outlined.ChatBubbleOutline
}

@Composable
fun SignageBadge() {
    Image(painterResource(R.drawable.kajovo_mark_logo), Branding.APP_NAME,
        Modifier.size(48.dp), contentScale = ContentScale.Fit)
}

@Composable
fun FullBrandLockup(modifier: Modifier = Modifier.height(160.dp)) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        // The supplied full logo contains black lettering, so it keeps a light surface in both themes.
        Image(
            painter = painterResource(R.drawable.kajovo_full_logo),
            contentDescription = Branding.APP_NAME,
            modifier = Modifier.fillMaxSize().widthIn(max = 420.dp)
                .background(cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.SurfaceRaised, RoundedCornerShape(12.dp)),
            contentScale = ContentScale.Fit,
        )
    }
}

@Composable
fun FeatureCard(title: String, subtitle: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun StatePane(title: String, body: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally) {
        SignageBadge()
        Text(title, style = MaterialTheme.typography.titleLarge)
        if (body.isNotBlank()) Text(body, style = MaterialTheme.typography.bodyMedium)
        if (actionLabel != null && onAction != null) {
            Button(onClick = onAction) { Text(actionLabel) }
        }
    }
}

@Composable
fun BulletLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, Modifier.weight(2f), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun BrandFooter() {
    Text(Branding.COPYRIGHT, style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
fun CollapsibleFilters(content: @Composable ColumnScope.() -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { expanded = !expanded }) {
            Text(if (expanded) "Skrýt filtry" else "Filtry")
        }
        if (expanded) content()
    }
}
