package cz.hcasc.kajovohotel.core.designsystem

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.common.Branding
import cz.hcasc.kajovohotel.core.model.PortalRole

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
    content: @Composable () -> Unit,
) {
    var roleMenuExpanded by remember { mutableStateOf(false) }
    var sectionMenuExpanded by remember { mutableStateOf(false) }
    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                navigationIcon = {
                    if (onBackClick != null) {
                        IconButton(onClick = onBackClick) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zpět")
                        }
                    } else {
                        Image(
                            painterResource(R.drawable.kajovo_mark_logo), Branding.APP_NAME,
                            Modifier.padding(start = 12.dp).size(36.dp).background(
                                cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.SurfaceRaised, RoundedCornerShape(6.dp)),
                            contentScale = ContentScale.Fit,
                        )
                    }
                },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (onBackClick != null) {
                            Image(painterResource(R.drawable.kajovo_mark_logo), Branding.APP_NAME,
                                Modifier.size(28.dp).padding(end = 4.dp).background(
                                    cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens.SurfaceRaised, RoundedCornerShape(4.dp)), contentScale = ContentScale.Fit)
                        }
                        Column {
                            Text(title, style = MaterialTheme.typography.titleMedium)
                            if (roleLabel != title) Text(roleLabel, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                },
                actions = {
                    if (availableRoles.size > 1 && onRoleSelected != null) {
                        Box {
                            IconButton(onClick = { roleMenuExpanded = true }) {
                                Icon(Icons.Outlined.SwapHoriz, "Přepnout roli")
                            }
                            DropdownMenu(roleMenuExpanded, { roleMenuExpanded = false }) {
                                availableRoles.forEach { role ->
                                    DropdownMenuItem(
                                        text = { Text(role.displayName + if (role == activeRole) " ✓" else "") },
                                        onClick = {
                                            roleMenuExpanded = false
                                            if (role != activeRole) onRoleSelected(role)
                                        },
                                    )
                                }
                            }
                        }
                    }
                    Box {
                        IconButton(onClick = { sectionMenuExpanded = true }) {
                            Icon(Icons.Outlined.Menu, "Sekce a profil")
                        }
                        DropdownMenu(sectionMenuExpanded, { sectionMenuExpanded = false }) {
                            sections.forEach { (route, label) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = { sectionMenuExpanded = false; onSectionSelected?.invoke(route) },
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("Profil") },
                                onClick = { sectionMenuExpanded = false; onProfileClick() },
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).imePadding().padding(horizontal = 16.dp, vertical = 8.dp)) {
            content()
        }
    }
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
