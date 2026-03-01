export type Role =
  | 'pokojská'
  | 'housekeeping'
  | 'údržba'
  | 'maintenance'
  | 'recepce'
  | 'reception'
  | 'snídaně'
  | 'breakfast'
  | 'warehouse'
  | 'manager'
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
  admin: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read', 'settings:read'],
  manager: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read', 'settings:read'],
  recepce: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'reports:read'],
  reception: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'reports:read'],
  'údržba': ['dashboard:read', 'issues:read', 'reports:read'],
  maintenance: ['dashboard:read', 'issues:read', 'reports:read'],
  'snídaně': ['dashboard:read', 'breakfast:read', 'inventory:read'],
  breakfast: ['dashboard:read', 'breakfast:read', 'inventory:read'],
  pokojská: ['dashboard:read', 'lost_found:read', 'issues:read'],
  housekeeping: ['dashboard:read', 'lost_found:read', 'issues:read'],
  warehouse: ['dashboard:read', 'inventory:read'],
};

const ROLE_ALIASES: Record<string, Role> = {
  admin: 'admin',
  manager: 'manager',
  pokojská: 'pokojská',
  housekeeping: 'housekeeping',
  'údržba': 'údržba',
  udrzba: 'údržba',
  maintenance: 'maintenance',
  recepce: 'recepce',
  reception: 'reception',
  'snídaně': 'snídaně',
  snidane: 'snídaně',
  breakfast: 'breakfast',
  warehouse: 'warehouse',
  sklad: 'warehouse',
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
