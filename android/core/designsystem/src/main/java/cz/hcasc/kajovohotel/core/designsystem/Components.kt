package cz.hcasc.kajovohotel.core.designsystem

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoColorTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoRadiusTokens
import cz.hcasc.kajovohotel.core.designsystem.tokens.KajovoSpacingTokens
import cz.hcasc.kajovohotel.core.model.PortalRole

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortalChrome(
    title: String,
    roleLabel: String,
    onProfileClick: () -> Unit,
    onLogoutClick: () -> Unit,
    onBackClick: (() -> Unit)? = null,
    availableRoles: List<PortalRole> = emptyList(),
    activeRole: PortalRole? = null,
    onRoleSelected: ((PortalRole) -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    var roleMenuExpanded by remember(availableRoles, activeRole) { mutableStateOf(false) }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        SignageBadge()
                        Text(text = title, style = MaterialTheme.typography.titleLarge)
                        Text(text = roleLabel, style = MaterialTheme.typography.bodyMedium)
                    }
                },
                actions = {
                    if (availableRoles.size > 1 && onRoleSelected != null) {
                        Box {
                            IconButton(onClick = { roleMenuExpanded = true }) {
                                Icon(
                                    imageVector = Icons.Outlined.SwapHoriz,
                                    contentDescription = "Přepnout roli",
                                )
                            }
                            DropdownMenu(
                                expanded = roleMenuExpanded,
                                onDismissRequest = { roleMenuExpanded = false },
                            ) {
                                availableRoles.forEach { role ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                text = if (role == activeRole) {
                                                    "${role.displayName} • aktivní"
                                                } else {
                                                    role.displayName
                                                },
                                            )
                                        },
                                        onClick = {
                                            roleMenuExpanded = false
                                            if (role != activeRole) {
                                                onRoleSelected(role)
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                    TextButton(onClick = onProfileClick) { Text(text = "Profil") }
                    TextButton(onClick = onLogoutClick) { Text(text = "Odhlásit") }
                },
            )
        },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(KajovoSpacingTokens.S4),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = if (onBackClick != null) 72.dp else 0.dp),
            ) {
                content()
            }
            if (onBackClick != null) {
                ExtendedFloatingActionButton(
                    onClick = onBackClick,
                    icon = {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = "Zpět",
                        )
                    },
                    text = { Text("Zpět") },
                    modifier = Modifier.align(Alignment.BottomStart),
                )
            }
        }
    }
}

@Composable
fun SignageBadge() {
    Box(
        modifier = Modifier
            .background(KajovoColorTokens.SignRed, RoundedCornerShape(KajovoRadiusTokens.R8))
            .padding(horizontal = KajovoSpacingTokens.S4, vertical = KajovoSpacingTokens.S2),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.kajovo_mark_logo),
            contentDescription = "Kájovo Hotel",
            modifier = Modifier.height(56.dp),
            contentScale = ContentScale.Fit,
        )
    }
}

@Composable
fun FeatureCard(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(KajovoRadiusTokens.R12),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(KajovoSpacingTokens.S4),
            verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S2),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleLarge)
            Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun StatePane(
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(KajovoSpacingTokens.S4, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SignageBadge()
        Text(text = title, style = MaterialTheme.typography.headlineMedium)
        Text(text = body, style = MaterialTheme.typography.bodyLarge)
        if (actionLabel != null && onAction != null) {
            TextButton(onClick = onAction) { Text(text = actionLabel) }
        }
    }
}

@Composable
fun BulletLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        Text(text = value, style = MaterialTheme.typography.bodyLarge)
    }
}
