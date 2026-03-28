export type Role = 'recepce' | 'pokojská' | 'údržba' | 'snídaně' | 'sklad' | 'admin';

export type ModuleKey =
  | 'dashboard'
  | 'housekeeping'
  | 'breakfast'
  | 'lost_found'
  | 'issues'
  | 'inventory'
  | 'reports'
  | 'users'
  | 'settings';

export type Permission = `${ModuleKey}:${'read' | 'write'}`;

const MODULE_READ_ORDER: ModuleKey[] = [
  'dashboard',
  'housekeeping',
  'breakfast',
  'lost_found',
  'issues',
  'inventory',
  'reports',
  'users',
  'settings',
];

export const ROLE_ALIASES: Record<string, Role> = {
  admin: 'admin',
  recepce: 'recepce',
  reception: 'recepce',
  pokojská: 'pokojská',
  pokojska: 'pokojská',
  housekeeping: 'pokojská',
  údržba: 'údržba',
  udrzba: 'údržba',
  maintenance: 'údržba',
  snídaně: 'snídaně',
  snidane: 'snídaně',
  breakfast: 'snídaně',
  sklad: 'sklad',
  warehouse: 'sklad',
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'dashboard:read',
    'housekeeping:read',
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
    'users:read',
    'users:write',
    'settings:read',
    'settings:write',
  ],
  recepce: [
    'breakfast:read',
    'breakfast:write',
    'lost_found:read',
    'lost_found:write',
    'reports:read',
    'reports:write',
  ],
  pokojská: ['housekeeping:read', 'issues:write', 'lost_found:write'],
  údržba: ['issues:read', 'issues:write'],
  snídaně: ['breakfast:read', 'breakfast:write'],
  sklad: ['inventory:read', 'inventory:write', 'reports:read'],
};

export const ROLE_MODULES: Record<Role, ModuleKey[]> = Object.fromEntries(
  (Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => [
    role,
    MODULE_READ_ORDER.filter((moduleKey) =>
      ROLE_PERMISSIONS[role].includes(`${moduleKey}:read` as Permission)
    ),
  ])
) as Record<Role, ModuleKey[]>;

export const ADMIN_SWITCHABLE_ROLES: Role[] = ['recepce', 'pokojská', 'údržba', 'snídaně', 'sklad'];

export function roleCanAccessAnyModule(role: Role, permissions: Iterable<string>): boolean {
  const roleModules = ROLE_MODULES[role] ?? [];
  for (const moduleKey of roleModules) {
    if (canReadModule(permissions, moduleKey) || canWriteModule(permissions, moduleKey)) {
      return true;
    }
  }
  return false;
}

export function visibleRolesForPermissions(roles: Iterable<Role>, permissions: Iterable<string>): Role[] {
  return Array.from(new Set(roles)).filter((role) => roleCanAccessAnyModule(role, permissions));
}

export function resolveActiveRoleForPermissions(
  roles: Iterable<Role>,
  activeRole: Role | null | undefined,
  permissions: Iterable<string>,
): Role | null {
  const visibleRoles = visibleRolesForPermissions(roles, permissions);
  if (activeRole && visibleRoles.includes(activeRole)) {
    return activeRole;
  }
  return visibleRoles.length === 1 ? visibleRoles[0] : null;
}

export const ROLE_LABELS_CS: Record<Role, string> = {
  admin: 'Administrátor',
  recepce: 'Recepce',
  pokojská: 'Pokojská',
  údržba: 'Údržba',
  snídaně: 'Snídaně',
  sklad: 'Sklad',
};

export const ROLE_LABELS_EN: Record<Role, string> = {
  admin: 'Administrator',
  recepce: 'Front desk',
  pokojská: 'Housekeeping',
  údržba: 'Maintenance',
  snídaně: 'Breakfast',
  sklad: 'Inventory',
};

function normalizeRoleToken(raw?: string | null): string {
  return (raw ?? '')
    .trim()
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseRole(raw?: string | null): Role | null {
  const normalized = normalizeRoleToken(raw);
  return ROLE_ALIASES[normalized] ?? null;
}

export function normalizeRole(raw?: string | null): Role {
  const role = parseRole(raw);
  if (!role) {
    throw new Error(`Unknown role: ${String(raw ?? '')}`);
  }
  return role;
}

export function rolePermissionList(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function rolePermissionSet(role: Role): Set<Permission> {
  return new Set(rolePermissionList(role));
}

export function canReadModule(permissions: Iterable<string>, moduleKey: string): boolean {
  for (const permission of permissions) {
    if (permission === `${moduleKey}:read`) {
      return true;
    }
  }
  return false;
}

export function canWriteModule(permissions: Iterable<string>, moduleKey: string): boolean {
  for (const permission of permissions) {
    if (permission === `${moduleKey}:write`) {
      return true;
    }
  }
  return false;
}
