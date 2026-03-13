from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status

Role = str
Permission = str

ROLE_PERMISSIONS: dict[Role, set[Permission]] = {
    'admin': {
        'dashboard:read',
        'housekeeping:read',
        'breakfast:read',
        'breakfast:write',
        'lost_found:read',
        'lost_found:write',
        'issues:read',
        'issues:write',
        'inventory:read',
        'inventory:write',
        'reports:read',
        'reports:write',
        'users:read',
        'users:write',
        'settings:read',
        'settings:write',
    },
    'pokojská': {
        'housekeeping:read',
        'issues:write',
        'lost_found:write',
    },
    'údržba': {
        'issues:read',
        'issues:write',
    },
    'recepce': {
        'breakfast:read',
        'breakfast:write',
        'lost_found:read',
        'lost_found:write',
    },
    'snídaně': {
        'breakfast:read',
        'breakfast:write',
        'inventory:read',
        'inventory:write',
    },
    'sklad': {
        'breakfast:read',
        'breakfast:write',
        'inventory:read',
        'inventory:write',
    },
}

ROLE_ALIASES: dict[str, str] = {
    'admin': 'admin',
    'pokojská': 'pokojská',
    'pokojska': 'pokojská',
    'housekeeping': 'pokojská',
    'údržba': 'údržba',
    'udrzba': 'údržba',
    'maintenance': 'údržba',
    'recepce': 'recepce',
    'reception': 'recepce',
    'snídaně': 'snídaně',
    'snidane': 'snídaně',
    'breakfast': 'snídaně',
    'warehouse': 'sklad',
    'sklad': 'sklad',
}

ROLE_AUDIT_EXPORT: dict[str, str] = {
    'admin': 'admin',
    'pokojská': 'housekeeping',
    'údržba': 'maintenance',
    'recepce': 'reception',
    'snídaně': 'breakfast',
    'sklad': 'warehouse',
}

WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}

COMMON_ENCODING_DRIFT_REPAIRS: dict[str, str] = {
    'pokojskÄË‡': 'pokojská',
    'pokojskăˇ': 'pokojská',
    'ÄĹźdrÄąÄľba': 'údržba',
    'ăşdrĹľba': 'údržba',
    'snÄÂ­danĂ„â€ş': 'snídaně',
}


def _repair_text_encoding_drift(value: str) -> str:
    repaired = COMMON_ENCODING_DRIFT_REPAIRS.get(value, value)
    if repaired != value:
        return repaired
    for source_encoding in ('cp1250', 'latin-1'):
        try:
            candidate = value.encode(source_encoding).decode('utf-8')
        except UnicodeError:
            continue
        if candidate != value:
            return candidate
    return value


def normalize_role(raw_role: str | None) -> str:
    role = _repair_text_encoding_drift(raw_role or 'recepce').strip().lower()
    return ROLE_ALIASES.get(role, 'recepce')


def role_for_audit(raw_role: str | None) -> str:
    return ROLE_AUDIT_EXPORT.get(normalize_role(raw_role), 'reception')


def parse_identity(request: Request) -> tuple[str, str, str]:
    from app.security.auth import require_session

    session = read_session_cookie(request.cookies.get('kajovo_session'))
    if not session:
        return 'anonymous', 'anonymous', 'recepce'
    actor_id = session['email']
    actor_name = session['email']
    selected = session.get('active_role') or session.get('role')
    actor_role = normalize_role(str(selected) if selected else None)
    return actor_id, actor_name, actor_role


def has_permission(role: str, permission: Permission) -> bool:
    permissions = ROLE_PERMISSIONS.get(role, set())
    return permission in permissions


def require_permission(module: str, action: str) -> Callable[[Request], None]:
    required = f'{module}:{action}'

    def _check_permission(request: Request) -> None:
        from app.security.auth import require_session

        session = require_session(request)
        actor_id = session['email']
        selected = session.get('active_role') or session.get('role')
        actor_role = normalize_role(str(selected) if selected else None)
        request.state.actor_id = actor_id
        request.state.actor_role = actor_role
        if session.get('actor_type') == 'portal' and not session.get('active_role'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Active role must be selected',
            )
        if not has_permission(actor_role, required):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Missing permission: {required}',
            )

    return _check_permission


def require_actor_type(expected_actor_type: str) -> Callable[[Request], None]:
    def _check_actor_type(request: Request) -> None:
        from app.security.auth import require_session

        session = require_session(request)
        actor_type = session.get('actor_type', 'portal')
        if actor_type != expected_actor_type:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Missing actor type: {expected_actor_type}',
            )

    return _check_actor_type


def require_module_access(module: str, request: Request) -> None:
    action = 'write' if request.method in WRITE_METHODS else 'read'
    checker = require_permission(module, action)
    checker(request)


def module_access_dependency(module: str) -> Callable[[Request], None]:
    def _module_access(request: Request) -> None:
        require_module_access(module, request)

    return _module_access


def inject_identity(request: Request) -> None:
    from app.security.auth import require_session

    session = require_session(request)
    actor_id = session['email']
    selected = session.get('active_role') or session.get('role')
    actor_role = normalize_role(str(selected) if selected else None)
    request.state.actor_id = actor_id
    request.state.actor_role = actor_role


IdentityDependency = Depends(inject_identity)
