package cz.hcasc.kajovohotel.core.testing

import cz.hcasc.kajovohotel.core.model.ActorType
import cz.hcasc.kajovohotel.core.model.AuthenticatedIdentity
import cz.hcasc.kajovohotel.core.model.PortalRole

object TestingFixtures {
    val receptionistIdentity = AuthenticatedIdentity(
        email = "recepce@example.invalid",
        actorType = ActorType.PORTAL,
        roleLabel = "recepce",
        roles = listOf(PortalRole.RECEPTION),
        activeRole = PortalRole.RECEPTION,
        permissions = setOf("breakfast:read", "breakfast:write", "lost_found:read", "lost_found:write"),
    )
}
