import React from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ia from '../../../kajovo-hotel/ux/ia.json';
import { AppShell, SkeletonPage, StateView } from '@kajovo/ui';
import { canReadModule, type AuthProfile } from '../rbac';

type AccessDeniedProps = {
  moduleLabel: string;
  role: string;
  userId: string;
};

const ROLE_LABELS: Record<string, string> = {
  recepce: 'Recepce',
  pokojská: 'Pokojská',
  údržba: 'Údržba',
  snídanì: 'Snídanì',
  sklad: 'Sklad',
};
const ROLE_MODULES: Record<string, string[]> = {
  recepce: ['lost_found', 'breakfast'],
  pokojská: ['lost_found', 'issues', 'breakfast', 'inventory'],
  údržba: ['issues'],
  snídanì: ['breakfast', 'issues', 'inventory'],
  sklad: ['breakfast', 'issues', 'inventory'],
};
function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function roleModules(role: string | null | undefined): string[] {
  if (!role) {
    return [];
  }
  return ROLE_MODULES[role] ?? [];
}

function readCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('kajovo_csrf='))
    ?.split('=')[1] ?? '';
}

function RoleSelectPage({ roles }: { roles: string[] }): JSX.Element {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const selectRole = React.useCallback(async (role: string) => {
    setError(null);
    setBusy(true);
    const csrfToken = readCsrfToken();
    const response = await fetch('/api/auth/select-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': decodeURIComponent(csrfToken) } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      setBusy(false);
      setError('Výbìr role selhal.');
      return;
    }
    window.location.assign('/');
  }, []);

  React.useEffect(() => {
    if (roles.length === 1) {
      void selectRole(roles[0]);
    }
  }, [roles, selectRole]);

  return (
    <main className="k-page" data-testid="role-select-page">
      <h1>Vyberte roli</h1>
      <p className="k-login-copy">Pro pokraèování zvolte roli, ve které budete pracovat.</p>
      <div className="k-toolbar">
        {roles.map((role) => (
          <button key={role} className="k-button" type="button" onClick={() => void selectRole(role)} disabled={busy}>
            {roleLabel(role)}
          </button>
        ))}
      </div>
      {error ? <StateView title="Chyba" description={error} stateKey="error" /> : null}
      {busy ? <SkeletonPage /> : null}
    </main>
  );
}

function AccessDeniedPage({ moduleLabel, role, userId }: AccessDeniedProps): JSX.Element {
  return (
    <main className="k-page" data-testid="access-denied-page">
      <StateView
        title="Pøístup odepøen"
        description={`Role ${role} (uživatel ${userId}) nemá oprávnìní pro modul ${moduleLabel}.`}
        stateKey="error"
        action={
          <Link className="k-button secondary" to="/">
            Zpìt na pøehled
          </Link>
        }
      />
    </main>
  );
}

type PortalRouteDeps = {
  Dashboard: () => JSX.Element;
  BreakfastList: () => JSX.Element;
  BreakfastForm: ({ mode }: { mode: 'create' | 'edit' }) => JSX.Element;
  BreakfastDetail: () => JSX.Element;
  LostFoundList: () => JSX.Element;
  LostFoundForm: ({ mode }: { mode: 'create' | 'edit' }) => JSX.Element;
  LostFoundDetail: () => JSX.Element;
  IssuesList: () => JSX.Element;
  IssuesForm: ({ mode }: { mode: 'create' | 'edit' }) => JSX.Element;
  IssuesDetail: () => JSX.Element;
  InventoryList: () => JSX.Element;
  InventoryForm: ({ mode }: { mode: 'create' | 'edit' }) => JSX.Element;
  InventoryDetail: () => JSX.Element;
  ReportsList: () => JSX.Element;
  ReportsForm: ({ mode }: { mode: 'create' | 'edit' }) => JSX.Element;
  ReportsDetail: () => JSX.Element;
  IntroRoute: React.ComponentType;
  OfflineRoute: React.ComponentType;
  MaintenanceRoute: React.ComponentType;
  NotFoundRoute: React.ComponentType;
};

export function PortalRoutes({
  currentPath,
  auth,
  modules,
  deps,
}: {
  currentPath: string;
  auth: AuthProfile;
  modules: typeof ia.modules;
  deps: PortalRouteDeps;
}): JSX.Element {
  if (auth.userId === 'anonymous' || auth.actorType !== 'portal') {
    return <Navigate to="/login" replace />;
  }

  const activeRole = auth.activeRole ?? (auth.roles.length === 1 ? auth.roles[0] : null);
  if (!activeRole) {
    return <RoleSelectPage roles={auth.roles} />;
  }

  const roleModuleKeys = roleModules(activeRole);
  const moduleByKey = new Map(modules.map((module) => [module.key, module]));
  const orderedRoleModules = roleModuleKeys
    .map((key) => moduleByKey.get(key))
    .filter((module): module is typeof modules[number] => Boolean(module));
  const allowedModules = orderedRoleModules.filter((module) => canReadModule(auth.permissions, module.key));
  const extraModules = modules.filter((module) => {
    const hasPermissions = Array.isArray(module.permissions) && module.permissions.length > 0;
    if (hasPermissions) {
      return false;
    }
    return !roleModuleKeys.includes(module.key);
  });
  const navigationModules = [...allowedModules, ...extraModules];
  const primaryRoute = allowedModules[0]?.route ?? '/';

  if (allowedModules.length === 0) {
    return (
      <main className="k-page" data-testid="access-denied-page">
        <StateView
          title="Pøístup odepøen"
          description={`Role ${activeRole} (uživatel ${auth.userId}) nemá žádné dostupné moduly.`}
          stateKey="error"
        />
      </main>
    );
  }

  const isAllowed = (moduleKey: string): boolean => canReadModule(auth.permissions, moduleKey);

  return (
    <AppShell
      panelLayout="portal"
      modules={navigationModules}
      navigationRules={ia.navigation.rules}
      navigationSections={ia.navigation.sections}
      currentPath={currentPath}
    >
      <Routes>
        <Route path="/" element={primaryRoute !== '/' ? <Navigate to={primaryRoute} replace /> : <deps.Dashboard />} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <deps.BreakfastList /> : <AccessDeniedPage moduleLabel="Snídanì" role={activeRole} userId={auth.userId} />} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') ? <deps.BreakfastForm mode="create" /> : <AccessDeniedPage moduleLabel="Snídanì" role={activeRole} userId={auth.userId} />} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') ? <deps.BreakfastDetail /> : <AccessDeniedPage moduleLabel="Snídanì" role={activeRole} userId={auth.userId} />} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') ? <deps.BreakfastForm mode="edit" /> : <AccessDeniedPage moduleLabel="Snídanì" role={activeRole} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <deps.LostFoundList /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={activeRole} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="create" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={activeRole} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <deps.LostFoundDetail /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={activeRole} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="edit" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={activeRole} userId={auth.userId} />} />
        <Route path="/zavady" element={isAllowed('issues') ? <deps.IssuesList /> : <AccessDeniedPage moduleLabel="Závady" role={activeRole} userId={auth.userId} />} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <deps.IssuesForm mode="create" /> : <AccessDeniedPage moduleLabel="Závady" role={activeRole} userId={auth.userId} />} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <deps.IssuesDetail /> : <AccessDeniedPage moduleLabel="Závady" role={activeRole} userId={auth.userId} />} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <deps.IssuesForm mode="edit" /> : <AccessDeniedPage moduleLabel="Závady" role={activeRole} userId={auth.userId} />} />
        <Route path="/sklad" element={isAllowed('inventory') ? <deps.InventoryList /> : <AccessDeniedPage moduleLabel="Skladové hospodáøství" role={activeRole} userId={auth.userId} />} />
        <Route path="/sklad/nova" element={isAllowed('inventory') ? <deps.InventoryForm mode="create" /> : <AccessDeniedPage moduleLabel="Skladové hospodáøství" role={activeRole} userId={auth.userId} />} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <deps.InventoryDetail /> : <AccessDeniedPage moduleLabel="Skladové hospodáøství" role={activeRole} userId={auth.userId} />} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') ? <deps.InventoryForm mode="edit" /> : <AccessDeniedPage moduleLabel="Skladové hospodáøství" role={activeRole} userId={auth.userId} />} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <deps.ReportsList /> : <AccessDeniedPage moduleLabel="Hlášení" role={activeRole} userId={auth.userId} />} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <deps.ReportsForm mode="create" /> : <AccessDeniedPage moduleLabel="Hlášení" role={activeRole} userId={auth.userId} />} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <deps.ReportsDetail /> : <AccessDeniedPage moduleLabel="Hlášení" role={activeRole} userId={auth.userId} />} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <deps.ReportsForm mode="edit" /> : <AccessDeniedPage moduleLabel="Hlášení" role={activeRole} userId={auth.userId} />} />
        <Route path="/intro" element={<React.Suspense fallback={<SkeletonPage />}><deps.IntroRoute /></React.Suspense>} />
        <Route path="/offline" element={<React.Suspense fallback={<SkeletonPage />}><deps.OfflineRoute /></React.Suspense>} />
        <Route path="/maintenance" element={<React.Suspense fallback={<SkeletonPage />}><deps.MaintenanceRoute /></React.Suspense>} />
        <Route path="/404" element={<React.Suspense fallback={<SkeletonPage />}><deps.NotFoundRoute /></React.Suspense>} />
        <Route path="/dalsi" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </AppShell>
  );
}









