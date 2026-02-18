export type Role = 'reception' | 'maintenance' | 'warehouse' | 'manager' | 'admin';

const rolePermissions: Record<Role, string[]> = {
  admin: [
    'dashboard:read',
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
  ],
  manager: [
    'dashboard:read',
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
  ],
  reception: [
    'dashboard:read',
    'breakfast:read',
    'breakfast:write',
    'lost_found:read',
    'lost_found:write',
    'issues:read',
    'issues:write',
    'reports:read',
  ],
  maintenance: ['dashboard:read', 'issues:read', 'issues:write', 'reports:read'],
  warehouse: ['dashboard:read', 'inventory:read', 'inventory:write', 'reports:read'],
};

export type AuthProfile = {
  userId: string;
  role: Role;
  permissions: Set<string>;
};

type TokenPayload = {
  userId?: string;
  role?: string;
  permissions?: string[];
};

function normalizeRole(input: string | undefined): Role {
  if (input === 'admin' || input === 'manager' || input === 'maintenance' || input === 'warehouse' || input === 'reception') {
    return input;
  }
  return 'manager';
}

function parseTokenPayload(encodedToken: string | null): TokenPayload | null {
  if (!encodedToken) {
    return null;
  }

  try {
    const decoded = atob(encodedToken);
    const parsed = JSON.parse(decoded) as TokenPayload;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveAuthProfile(search: string): AuthProfile {
  const params = new URLSearchParams(search);
  const tokenPayload = parseTokenPayload(params.get('access_token'));
  const testProfile = typeof window !== 'undefined' ? (window as Window & { __KAJOVO_TEST_AUTH__?: TokenPayload }).__KAJOVO_TEST_AUTH__ : undefined;
  const source = testProfile ?? tokenPayload ?? {};
  const role = normalizeRole(source.role);
  const basePermissions = rolePermissions[role];
  const explicitPermissions = Array.isArray(source.permissions) ? source.permissions : basePermissions;

  return {
    userId: source.userId ?? 'anonymous',
    role,
    permissions: new Set(explicitPermissions),
  };
}

export function canReadModule(permissions: Set<string>, moduleKey: string): boolean {
  return permissions.has(`${moduleKey}:read`);
}
