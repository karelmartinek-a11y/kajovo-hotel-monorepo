"""Explicit CML module grants, independent of historical native job roles."""

from app.security.cml_assertion import AssertionDenied

MODULES = {
    "hotel.rooms": "housekeeping",
    "hotel.breakfast": "breakfast",
    "hotel.lostfound": "lost_found",
    "hotel.issues": "issues",
    "hotel.inventory": "inventory",
}
PATH_MODULES = {
    "housekeeping": "housekeeping",
    "breakfast": "breakfast",
    "lost-found": "lost_found",
    "issues": "issues",
    "inventory": "inventory",
}


def grant_permissions(claims):
    grant = claims.get("grant")
    if not isinstance(grant, dict) or set(grant) != {"contract", "permissions", "dataScope"}:
        raise AssertionDenied("module_grant_required")
    values = grant.get("permissions")
    if (
        claims.get("role") != "member"
        or claims.get("authzPolicy") is not None
        or grant["contract"] != "kajovo-web-grant/1"
        or grant["dataScope"] != {"kind": "service"}
        or not isinstance(values, list)
        or not values
        or any(not isinstance(value, str) for value in values)
        or len(set(values)) != len(values)
        or any(value not in MODULES for value in values)
    ):
        raise AssertionDenied("module_grant_invalid")
    return {MODULES[value] + ":" + action for value in values for action in ("read", "write")}


def module_manager(request, module=None):
    session = getattr(request.state, "_kajovo_auth_session", None)
    if not session or "cml_permissions" not in session:
        return False
    if module is None:
        parts = request.url.path.removeprefix("/cml-web").split("/")
        module = (
            PATH_MODULES.get(parts[3]) if len(parts) > 3 and parts[1:3] == ["api", "v1"] else None
        )
    return module is not None and module + ":write" in session["cml_permissions"]
