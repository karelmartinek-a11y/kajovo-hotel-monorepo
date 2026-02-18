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
    },
    "manager": {
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
    },
    "reception": {
        "dashboard:read",
        "breakfast:read",
        "breakfast:write",
        "lost_found:read",
        "lost_found:write",
        "issues:read",
        "issues:write",
        "reports:read",
    },
    "maintenance": {
        "dashboard:read",
        "issues:read",
        "issues:write",
        "reports:read",
    },
    "warehouse": {
        "dashboard:read",
        "inventory:read",
        "inventory:write",
        "reports:read",
    },
}

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def normalize_role(raw_role: str | None) -> str:
    role = (raw_role or "manager").strip().lower()
    return role if role in ROLE_PERMISSIONS else "manager"


def parse_identity(request: Request) -> tuple[str, str, str]:
    actor_id = (
        request.headers.get("x-user-id")
        or request.headers.get("x-user")
        or request.headers.get("x-forwarded-user")
        or "anonymous"
    )
    actor_name = request.headers.get("x-user") or actor_id
    actor_role = normalize_role(request.headers.get("x-user-role"))
    return actor_id, actor_name, actor_role


def has_permission(role: str, permission: Permission) -> bool:
    permissions = ROLE_PERMISSIONS.get(role, set())
    return permission in permissions


def require_permission(module: str, action: str) -> Callable[[Request], None]:
    required = f"{module}:{action}"

    def _check_permission(request: Request) -> None:
        actor_id, _, actor_role = parse_identity(request)
        request.state.actor_id = actor_id
        request.state.actor_role = actor_role
        if not has_permission(actor_role, required):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {required}",
            )

    return _check_permission


def require_module_access(module: str, request: Request) -> None:
    action = "write" if request.method in WRITE_METHODS else "read"
    checker = require_permission(module, action)
    checker(request)


def module_access_dependency(module: str) -> Callable[[Request], None]:
    def _module_access(request: Request) -> None:
        require_module_access(module, request)

    return _module_access


def inject_identity(request: Request) -> None:
    actor_id, _, actor_role = parse_identity(request)
    request.state.actor_id = actor_id
    request.state.actor_role = actor_role


IdentityDependency = Depends(inject_identity)
