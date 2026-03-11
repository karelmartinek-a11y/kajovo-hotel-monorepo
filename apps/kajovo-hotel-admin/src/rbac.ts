import {
  ADMIN_SWITCHABLE_ROLES,
  ROLE_MODULES,
  canReadModule as sharedCanReadModule,
  normalizeRole,
  rolePermissionSet,
  type Role,
} from '@kajovo/shared';

export type { Role };
export { ROLE_MODULES, ADMIN_SWITCHABLE_ROLES };

export type AuthProfile = {
  userId: string;
  role: Role;
  roles: Role[];
  activeRole: Role | null;
  permissions: Set<string>;
  actorType: 'admin' | 'portal';
};

export type ResolvedAuthState =
  | { status: 'authenticated'; profile: AuthProfile }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

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

async function readAuthErrorMessage(response: Response): Promise<string> {
  const fallback = 'Nepodarilo se overit prihlaseni.';
  const raw = await response.text();
  if (!raw) {
    return fallback;
  }
  try {
    const payload = JSON.parse(raw) as { detail?: unknown };
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Fall back to the raw response body.
  }
  return raw.trim() || fallback;
}

export async function resolveAuthProfile(): Promise<ResolvedAuthState> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (response.status === 401 || response.status === 403) {
      return { status: 'unauthenticated' };
    }
    if (!response.ok) {
      return {
        status: 'error',
        message: await readAuthErrorMessage(response),
      };
    }
    const payload = (await response.json()) as AuthMeResponse;
    const role = normalizeRole(payload.role);
    const roles = Array.isArray(payload.roles) && payload.roles.length > 0
      ? payload.roles.map((item) => normalizeRole(item))
      : [role];
    const activeRole = payload.active_role ? normalizeRole(payload.active_role) : role;
    return {
      status: 'authenticated',
      profile: {
        userId: payload.email,
        role,
        roles,
        activeRole,
        permissions: Array.isArray(payload.permissions) && payload.permissions.length > 0
          ? new Set(payload.permissions)
          : rolePermissions(role),
        actorType: payload.actor_type,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error && error.message
        ? error.message
        : 'Nepodarilo se overit prihlaseni.',
    };
  }
}

export function canReadModule(permissions: Set<string>, moduleKey: string): boolean {
  return sharedCanReadModule(permissions, moduleKey);
}
