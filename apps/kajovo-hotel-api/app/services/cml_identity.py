"""Current Hotel roles are resolved locally, never supplied by browser state."""
from app.config import get_settings
from app.db.models import PortalUser
from app.security.cml_assertion import AssertionDenied
from app.security.rbac import ROLE_PERMISSIONS, normalize_role


def resolve_identity(db, claims, selected_role):
    user = None
    if claims['sub'] == 'KRMAR78':
        roles, admin, name, principal = ['admin'], True, 'karmar78', get_settings().admin_email.strip().lower()
    else:
        user = db.get(PortalUser, int(claims['nativeId']))
        if user is None or not user.is_active:
            raise AssertionDenied('local_account_unavailable')
        roles = [normalize_role(r.role) for r in user.roles]
        admin = claims['role'] == 'admin' and 'admin' in roles
        if claims['role'] == 'admin' and not admin:
            raise AssertionDenied('local_admin_role_required')
        roles = ['admin'] if admin else [r for r in roles if r != 'admin']
        if not roles:
            raise AssertionDenied('local_role_required')
        name, principal = user.first_name + ' ' + user.last_name, user.email
    role = selected_role or roles[0]
    if role not in roles:
        raise AssertionDenied('role_denied')
    session = {'session_id': 'cml:' + claims['sid'], 'email': principal, 'role': role, 'roles': roles, 'active_role': role, 'actor_type': 'admin' if admin else 'portal', 'portal_user_id': user.id if user else None, 'web_activity_session': False}
    return {'state': {'_kajovo_auth_session': session}, 'public': {'admin': admin, 'name': name, 'roles': roles, 'active_role': role, 'permissions': sorted(ROLE_PERMISSIONS.get(role,set())), 'available_permissions': sorted(set().union(*(ROLE_PERMISSIONS.get(item, set()) for item in roles))), 'role_permissions': {item: sorted(ROLE_PERMISSIONS.get(item, set())) for item in roles}, 'languages': ['cs'] if admin else ['cs', 'en', 'uk']}}
