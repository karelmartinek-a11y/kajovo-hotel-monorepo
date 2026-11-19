"""Explicit CML module grants, independent of historical native job roles."""

from app.db.warehouse import Warehouse
from app.security.cml_assertion import AssertionDenied

MODULES = {
    "hotel.rooms": "housekeeping",
    "hotel.breakfast": "breakfast",
    "hotel.lostfound": "lost_found",
    "hotel.issues": "issues",
    "hotel.inventory.snidane": "inventory_snidane",
    "hotel.inventory.drogerie": "inventory_drogerie",
}
WAREHOUSE_MODULES = {warehouse.value: f"inventory_{warehouse.value}" for warehouse in Warehouse}
LEGACY_WAREHOUSE_GRANT = "hotel.inventory"
PATH_MODULES = {
    "housekeeping": "housekeeping",
    "breakfast": "breakfast",
    "lost-found": "lost_found",
    "issues": "issues",
    "inventory": "inventory",
}

def warehouse_module(values=()):
    if not values:
        return WAREHOUSE_MODULES[Warehouse.BREAKFAST]
    return WAREHOUSE_MODULES.get(values[0]) if len(values) == 1 else None


def path_module(suffix, warehouse_values=()):
    parts = suffix.split("/")
    if len(parts) < 3 or parts[:2] != ["api", "v1"]:
        return None
    module = PATH_MODULES.get(parts[2])
    return warehouse_module(warehouse_values) if module == "inventory" else module


def native_warehouse_permissions(permissions):
    return permissions | {
        f"{module}:{action}" for module in WAREHOUSE_MODULES.values()
        for action in ("read", "write") if f"inventory:{action}" in permissions
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
        or any(value not in MODULES and value != LEGACY_WAREHOUSE_GRANT for value in values)
    ):
        raise AssertionDenied("module_grant_invalid")
    modules = {MODULES[value] for value in values if value in MODULES}
    if LEGACY_WAREHOUSE_GRANT in values:
        modules.update(WAREHOUSE_MODULES.values())
    return {f"{module}:{action}" for module in modules for action in ("read", "write")}


def module_manager(request, module=None):
    session = getattr(request.state, "_kajovo_auth_session", None)
    if not session or "cml_permissions" not in session:
        return False
    if module is None:
        suffix = request.url.path.removeprefix("/cml-web").lstrip("/")
        module = path_module(suffix, request.query_params.getlist("warehouse"))
    return module is not None and module + ":write" in session["cml_permissions"]
