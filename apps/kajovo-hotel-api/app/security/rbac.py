from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status

Role = str
Permission = str

ROLE_PERMISSIONS: dict[Role, set[Permission]] = {
    "admin": {
        "dashboard:read",
        "breakfast:read",
        "breakfast:write",
        "lost_found:read",
        "lost_found:write",
        "issues:read",
        "issues:write",
        "inventory:read",
        "inventory:write",
        "reports:read",
        "reports:write",
        "users:read",
        "users:write",
    },
    "pokojská": {
        "dashboard:read",
        "lost_found:read",
        "lost_found:write",
        "issues:read",
        "inventory:read",
        "inventory:write",
    },
    "údržba": {
        "dashboard:read",
        "issues:read",
        "issues:write",
        "reports:read",
    },
    "recepce": {
        "dashboard:read",
        "breakfast:read",
        "breakfast:write",
        "lost_found:read",
        "lost_found:write",
        "reports:read",
    },
    "snídaně": {
        "dashboard:read",
        "breakfast:read",
        "breakfast:write",
    },
}

ROLE_ALIASES: dict[str, str] = {
    "admin": "admin",
    "pokojská": "pokojská",
    "housekeeping": "pokojská",
    "údržba": "údržba",
    "udrzba": "údržba",
    "maintenance": "údržba",
    "recepce": "recepce",
    "reception": "recepce",
    "manager": "recepce",
    "snídaně": "snídaně",
    "snidane": "snídaně",
    "breakfast": "snídaně",
    "warehouse": "pokojská",
    "sklad": "pokojská",
}

ROLE_AUDIT_EXPORT: dict[str, str] = {
    "admin": "admin",
    "pokojská": "housekeeping",
    "údržba": "maintenance",
    "recepce": "reception",
    "snídaně": "breakfast",
}

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def normalize_role(raw_role: str | None) -> str:
    role = (raw_role or "recepce").strip().lower()
    return ROLE_ALIASES.get(role, "recepce")


def role_for_audit(raw_role: str | None) -> str:
    return ROLE_AUDIT_EXPORT.get(normalize_role(raw_role), "reception")


def parse_identity(request: Request) -> tuple[str, str, str]:
    from app.security.auth import read_session_cookie

    session = read_session_cookie(request.cookies.get("kajovo_session"))
    if not session:
        return "anonymous", "anonymous", "recepce"
    actor_id = session["email"]
    actor_name = session["email"]
    selected = session.get("active_role") or session.get("role")
    actor_role = normalize_role(str(selected) if selected else None)
    return actor_id, actor_name, actor_role


def has_permission(role: str, permission: Permission) -> bool:
    permissions = ROLE_PERMISSIONS.get(role, set())
    return permission in permissions


def require_permission(module: str, action: str) -> Callable[[Request], None]:
    required = f"{module}:{action}"

    def _check_permission(request: Request) -> None:
        from app.security.auth import require_session

        session = require_session(request)
        actor_id = session["email"]
        selected = session.get("active_role") or session.get("role")
        actor_role = normalize_role(str(selected) if selected else None)
        request.state.actor_id = actor_id
        request.state.actor_role = actor_role
        if session.get("actor_type") == "portal" and not session.get("active_role"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active role must be selected",
            )
        if not has_permission(actor_role, required):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {required}",
            )

    return _check_permission


def require_actor_type(expected_actor_type: str) -> Callable[[Request], None]:
    def _check_actor_type(request: Request) -> None:
        from app.security.auth import require_session

        session = require_session(request)
        actor_type = session.get("actor_type", "portal")
        if actor_type != expected_actor_type:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing actor type: {expected_actor_type}",
            )

    return _check_actor_type


def require_module_access(module: str, request: Request) -> None:
    action = "write" if request.method in WRITE_METHODS else "read"
    checker = require_permission(module, action)
    checker(request)


def module_access_dependency(module: str) -> Callable[[Request], None]:
    def _module_access(request: Request) -> None:
        require_module_access(module, request)

    return _module_access


def inject_identity(request: Request) -> None:
    from app.security.auth import require_session

    session = require_session(request)
    actor_id = session["email"]
    selected = session.get("active_role") or session.get("role")
    actor_role = normalize_role(str(selected) if selected else None)
    request.state.actor_id = actor_id
    request.state.actor_role = actor_role


IdentityDependency = Depends(inject_identity)
