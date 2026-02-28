export type Role = 'pokojská' | 'údržba' | 'recepce' | 'snídaně' | 'admin';

export type AuthProfile = {
  userId: string;
  role: Role;
  roles: Role[];
  activeRole: Role | null;
  permissions: Set<string>;
  actorType: 'admin' | 'portal';
};

const ROLE_READ_PERMISSIONS: Record<Role, string[]> = {
  admin: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read'],
  recepce: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'reports:read'],
  'údržba': ['dashboard:read', 'issues:read', 'reports:read'],
  'snídaně': ['dashboard:read', 'breakfast:read', 'inventory:read'],
  pokojská: ['dashboard:read', 'lost_found:read', 'issues:read'],
};

export function rolePermissions(role: Role): Set<string> {
  return new Set(ROLE_READ_PERMISSIONS[role] ?? []);
}

type AuthMeResponse = {
  email: string;
  role: string;
  roles?: string[];
  active_role?: string | null;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

function normalizeRole(input: string | undefined): Role {
  if (input === 'admin' || input === 'pokojská' || input === 'údržba' || input === 'recepce' || input === 'snídaně') {
    return input;
  }
  return 'admin';
}

export async function resolveAuthProfile(): Promise<AuthProfile> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (!response.ok) {
    return { userId: 'anonymous', role: 'recepce', roles: ['recepce'], activeRole: null, permissions: rolePermissions('recepce'), actorType: 'portal' };
  }
  const payload = (await response.json()) as AuthMeResponse;
  const role = normalizeRole(payload.role);
  const roles = Array.isArray(payload.roles) && payload.roles.length > 0 ? payload.roles.map((item) => normalizeRole(item)) : [role];
  const activeRole = payload.active_role ? normalizeRole(payload.active_role) : role;
  return {
    userId: payload.email,
    role,
    roles,
    activeRole,
    permissions: Array.isArray(payload.permissions) && payload.permissions.length > 0
      ? new Set(payload.permissions)
      : rolePermissions(role),
    actorType: payload.actor_type,
  };
}

export function canReadModule(permissions: Set<string>, moduleKey: string): boolean {
  return permissions.has(`${moduleKey}:read`);
}
