export type Role =
  | 'pokojská'
  | 'údržba'
  | 'recepce'
  | 'snídaně'
  | 'sklad'
  | 'admin';

export type AuthProfile = {
  userId: string;
  role: Role;
  roles: Role[];
  activeRole: Role | null;
  permissions: Set<string>;
  actorType: 'admin' | 'portal';
};

const ROLE_READ_PERMISSIONS: Record<Role, string[]> = {
  admin: ['breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read', 'settings:read'],
  recepce: ['breakfast:read', 'lost_found:read'],
  údržba: ['issues:read'],
  snídaně: ['breakfast:read', 'issues:read', 'inventory:read'],
  pokojská: ['lost_found:read', 'issues:read', 'breakfast:read', 'inventory:read'],
  sklad: ['breakfast:read', 'issues:read', 'inventory:read'],
};

const ROLE_ALIASES: Record<string, Role> = {
  admin: 'admin',
  pokojská: 'pokojská',
  housekeeping: 'pokojská',
  údržba: 'údržba',
  udrzba: 'údržba',
  maintenance: 'údržba',
  recepce: 'recepce',
  reception: 'recepce',
  snídaně: 'snídaně',
  snidane: 'snídaně',
  breakfast: 'snídaně',
  warehouse: 'sklad',
  sklad: 'sklad',
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
  return ROLE_ALIASES[(input ?? '').trim().toLocaleLowerCase('cs-CZ')] ?? 'recepce';
}

export async function resolveAuthProfile(): Promise<AuthProfile> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (!response.ok) {
    return { userId: 'anonymous', role: 'recepce', roles: ['recepce'], activeRole: null, permissions: rolePermissions('recepce'), actorType: 'portal' };
  }
  const payload = (await response.json()) as AuthMeResponse;
  const role = normalizeRole(payload.role);
  const roles = Array.isArray(payload.roles) && payload.roles.length > 0 ? payload.roles.map((item) => normalizeRole(item)) : [role];
  const activeRole = payload.active_role ? normalizeRole(payload.active_role) : null;
  return {
    userId: payload.email,
    role,
    roles,
    activeRole,
    permissions: Array.isArray(payload.permissions) && payload.permissions.length > 0
      ? new Set(payload.permissions)
      : activeRole ? rolePermissions(activeRole) : new Set(),
    actorType: payload.actor_type,
  };
}

export function canReadModule(permissions: Set<string>, moduleKey: string): boolean {
  return permissions.has(`${moduleKey}:read`);
}
