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

export const ROLE_MODULES: Record<Role, ModuleKey[]> = {
  admin: ['dashboard', 'breakfast', 'housekeeping', 'lost_found', 'issues', 'inventory', 'reports'],
  recepce: ['lost_found', 'breakfast'],
  pokojská: ['housekeeping', 'lost_found', 'issues', 'inventory'],
  údržba: ['issues'],
  snídaně: ['breakfast'],
  sklad: ['issues', 'inventory'],
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
  recepce: ['breakfast:read', 'breakfast:write', 'lost_found:read', 'lost_found:write'],
  pokojská: [
    'housekeeping:read',
    'lost_found:read',
    'lost_found:write',
    'issues:read',
    'issues:write',
    'inventory:read',
    'inventory:write',
  ],
  údržba: ['issues:read', 'issues:write'],
  snídaně: ['breakfast:read', 'breakfast:write'],
  sklad: [
    'issues:read',
    'issues:write',
    'inventory:read',
    'inventory:write',
  ],
};

export const ADMIN_SWITCHABLE_ROLES: Role[] = ['recepce', 'pokojská', 'údržba', 'snídaně', 'sklad'];

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

export function normalizeRole(raw?: string | null): Role {
  const normalized = (raw ?? '').trim().toLowerCase();
  return ROLE_ALIASES[normalized] ?? 'recepce';
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
