export type Role = 'reception' | 'maintenance' | 'warehouse' | 'manager' | 'admin';

export type AuthProfile = {
  userId: string;
  role: Role;
  permissions: Set<string>;
  actorType: 'admin' | 'portal';
};

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
    return { userId: 'anonymous', role: 'manager', permissions: new Set(), actorType: 'portal' };
  }
  const payload = (await response.json()) as AuthMeResponse;
  const role = normalizeRole(payload.role);
  return {
    userId: payload.email,
    role,
    permissions: new Set(Array.isArray(payload.permissions) ? payload.permissions : []),
    actorType: payload.actor_type,
  };
}

export function canReadModule(permissions: Set<string>, moduleKey: string): boolean {
  return permissions.has(`${moduleKey}:read`);
}
