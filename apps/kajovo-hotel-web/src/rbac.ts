export type Role = 'reception' | 'maintenance' | 'warehouse' | 'manager' | 'admin';

export type AuthProfile = {
  userId: string;
  role: Role;
  permissions: Set<string>;
  actorType: 'admin' | 'portal';
};

const ROLE_READ_PERMISSIONS: Record<Role, string[]> = {
  admin: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read', 'users:read'],
  manager: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'inventory:read', 'reports:read'],
  reception: ['dashboard:read', 'breakfast:read', 'lost_found:read', 'issues:read', 'reports:read'],
  maintenance: ['dashboard:read', 'issues:read', 'reports:read'],
  warehouse: ['dashboard:read', 'inventory:read', 'reports:read'],
};

function rolePermissions(role: Role): Set<string> {
  return new Set(ROLE_READ_PERMISSIONS[role] ?? []);
}

type AuthMeResponse = {
  email: string;
  role: string;
  permissions: string[];
  actor_type: 'admin' | 'portal';
};

function normalizeRole(input: string | undefined): Role {
  if (input === 'admin' || input === 'manager' || input === 'maintenance' || input === 'warehouse' || input === 'reception') {
    return input;
  }
  return 'manager';
}

export async function resolveAuthProfile(): Promise<AuthProfile> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (!response.ok) {
    return { userId: 'anonymous', role: 'manager', permissions: rolePermissions('manager'), actorType: 'portal' };
  }
  const payload = (await response.json()) as AuthMeResponse;
  const role = normalizeRole(payload.role);
  return {
    userId: payload.email,
    role,
    permissions: Array.isArray(payload.permissions) && payload.permissions.length > 0
      ? new Set(payload.permissions)
      : rolePermissions(role),
    actorType: payload.actor_type,
  };
}

export function canReadModule(permissions: Set<string>, moduleKey: string): boolean {
  return permissions.has(`${moduleKey}:read`);
}
