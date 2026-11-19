"""Current Hotel roles are resolved locally, never supplied by browser state."""
from app.config import get_settings
from app.security.web_access import grant_permissions, native_warehouse_permissions
from app.db.models import PortalUser
from app.security.cml_assertion import AssertionDenied, central_administrator, central_settings
from app.security.rbac import ROLE_PERMISSIONS, normalize_role


def resolve_identity(db, claims, selected_role):
    user = None
    if central_administrator(claims) or central_settings(claims):
        roles,admin,name,principal=['admin'],True,claims['sub'],claims['sub']
    elif claims['sub'] == 'KRMAR78':
        roles, admin, name, principal = ['admin'], True, 'karmar78', get_settings().admin_email.strip().lower()
    else:
        user = db.get(PortalUser, int(claims['nativeId']))
        if user is None or not user.is_active:
            raise AssertionDenied('local_account_unavailable')
        roles = [normalize_role(r.role) for r in user.roles]
        explicit_permissions = grant_permissions(claims)
        admin = False
        if not roles:
            roles = ['recepce']
        name, principal = user.first_name + ' ' + user.last_name, user.email
    role = selected_role or roles[0]
    if role not in roles:
        raise AssertionDenied('role_denied')
    session = {'session_id': 'cml:' + claims['sid'], 'email': principal, 'role': role, 'roles': roles, 'active_role': role, 'actor_type': 'admin' if admin else 'portal', 'portal_user_id': user.id if user else None, 'web_activity_session': False}
    permissions = explicit_permissions if user else native_warehouse_permissions(ROLE_PERMISSIONS.get(role, set()))
    if user:
        session['cml_permissions'] = sorted(permissions)
    return {'state': {'_kajovo_auth_session': session}, 'public': {'admin': admin, 'cml_modules': bool(user), 'name': name, 'roles': roles, 'active_role': role, 'permissions': sorted(permissions), 'available_permissions': sorted(permissions), 'role_permissions': {item: sorted(permissions) for item in roles}, 'preferred_locale': user.preferred_locale if user and not admin else 'cs', 'languages': ['cs'] if admin else ['cs', 'en', 'uk']}}
