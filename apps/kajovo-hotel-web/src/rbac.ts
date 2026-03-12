import {
  ADMIN_SWITCHABLE_ROLES,
  ROLE_MODULES,
  canReadModule as sharedCanReadModule,
  normalizeRole,
  rolePermissionSet,
  type Role,
} from '@kajovo/shared';

export type { Role };
export { ROLE_MODULES, ADMIN_SWITCHABLE_ROLES, normalizeRole };

export type AuthProfile = {
  userId: string;
  role: Role;
  roles: Role[];
  activeRole: Role | null;
  permissions: Set<string>;
  actorType: 'admin' | 'portal';
};

export function rolePermissions(role: Role): Set<string> {
  return new Set(Array.from(rolePermissionSet(role)));
}

type AuthMeResponse = {
  email: string;
  role: string;
  roles?: string[];
  active_role?: string | null;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

export async function resolveAuthProfile(): Promise<AuthProfile> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (!response.ok) {
    return {
      userId: 'anonymous',
      role: 'recepce',
      roles: ['recepce'],
      activeRole: null,
      permissions: rolePermissions('recepce'),
      actorType: 'portal',
    };
  }
  const payload = (await response.json()) as AuthMeResponse;
  const role = normalizeRole(payload.role);
  const roles = Array.isArray(payload.roles) && payload.roles.length > 0
    ? payload.roles.map((item) => normalizeRole(item))
    : [role];
  const activeRole = payload.active_role ? normalizeRole(payload.active_role) : null;
  return {
    userId: payload.email,
    role,
    roles,
    activeRole,
    permissions: Array.isArray(payload.permissions) && payload.permissions.length > 0
      ? new Set(payload.permissions)
      : activeRole
        ? rolePermissions(activeRole)
        : new Set(),
    actorType: payload.actor_type,
  };
}

export function canReadModule(permissions: Set<string>, moduleKey: string): boolean {
  return sharedCanReadModule(permissions, moduleKey);
}
