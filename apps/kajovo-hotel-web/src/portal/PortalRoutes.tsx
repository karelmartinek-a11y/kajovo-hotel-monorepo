import React from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ia from '../../../kajovo-hotel/ux/ia.json';
import { AppShell, SkeletonPage, StateView } from '@kajovo/ui';
import { canReadModule, ROLE_MODULES, type AuthProfile, type Role } from '../rbac';
import { getAuthBundle, type AuthBundle } from '@kajovo/shared';

type AuthCopy = AuthBundle['copy'];

type AccessDeniedProps = {
  moduleLabel: string;
  roleLabel: string;
  userId: string;
  copy: AuthCopy;
};
function roleModules(role: Role | null | undefined): string[] {
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

type RoleSelectPageProps = {
  roles: string[];
  copy: AuthCopy;
  roleLabel: (role: string) => string;
};

function RoleSelectPage({ roles, copy, roleLabel }: RoleSelectPageProps): JSX.Element {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const continueAs = React.useCallback(
    (label: string) => (copy.continueAs ? copy.continueAs(label) : `Pokračovat jako ${label}`),
    [copy]
  );

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
      setError(copy.roleSelectError ?? 'Výběr role selhal.');
      return;
    }
    window.location.assign('/');
  }, [copy]);

  React.useEffect(() => {
    if (roles.length === 1) {
      void selectRole(roles[0]);
    }
  }, [roles, selectRole]);

  return (
    <main className="k-page" data-testid="role-select-page">
      <h1>{copy.roleSelectTitle ?? 'Vyberte roli'}</h1>
      <p className="k-login-copy">{copy.roleSelectDescription ?? 'Pro pokračování zvolte roli, ve které budete pracovat.'}</p>
      <div className="k-toolbar">
        {roles.map((role) => (
          <button key={role} className="k-button" type="button" onClick={() => void selectRole(role)} disabled={busy}>
            {continueAs(roleLabel(role))}
          </button>
        ))}
      </div>
      {error ? <StateView title={copy.accessDeniedTitle ?? 'Přístup odepřen'} description={error} stateKey="error" /> : null}
      {busy ? <SkeletonPage /> : null}
    </main>
  );
}

function AccessDeniedPage({ moduleLabel, roleLabel, userId, copy }: AccessDeniedProps): JSX.Element {
  const title = copy.accessDeniedTitle ?? 'Přístup odepřen';
  const description = copy.accessDeniedModule
    ? copy.accessDeniedModule(moduleLabel, roleLabel, userId)
    : `Role ${roleLabel} (uživatel ${userId}) nemá oprávnění pro modul ${moduleLabel}.`;
  return (
    <main className="k-page" data-testid="access-denied-page">
      <StateView
        title={title}
        description={description}
        stateKey="error"
        action={
          <Link className="k-button secondary" to="/">
            Zpět na přehled
          </Link>
        }
      />
    </main>
  );
}

type PortalRouteDeps = {
  Dashboard: () => JSX.Element;
  HousekeepingForm: () => JSX.Element;
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
  const bundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('portal', lang);
  }, []);
  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = bundle.locale;
    document.title = bundle.copy.eyebrow;
  }, [bundle.copy.eyebrow, bundle.locale]);
  const { copy, roleLabels, moduleLabels, navigation, sectionLabels } = bundle;
  const localizedRoleLabel = React.useCallback(
    (role: string) => roleLabels[role] ?? role,
    [roleLabels]
  );
  const localizedModuleLabel = React.useCallback(
    (key: string) => moduleLabels[key] ?? key,
    [moduleLabels]
  );
  const navigationRules = React.useMemo(
    () => ({
      ...ia.navigation.rules,
      overflowLabel: navigation.overflowLabel,
      phoneDrawerLabel: navigation.phoneDrawerLabel,
      phoneSearchPlaceholder: navigation.phoneSearchPlaceholder,
      ariaLabel: navigation.ariaLabel,
      defaultGroupLabel: moduleLabels['other'],
    }),
    [moduleLabels['other'], navigation.ariaLabel, navigation.overflowLabel, navigation.phoneDrawerLabel, navigation.phoneSearchPlaceholder]
  );
  const navigationSections = React.useMemo(
    () =>
      ia.navigation.sections.map((section) => ({
        ...section,
        label: sectionLabels[section.key] ?? section.label,
      })),
    [sectionLabels]
  );
  const localizedModules = React.useMemo(
    () =>
      modules.map((module) => ({
        ...module,
        label: moduleLabels[module.key] ?? module.label,
      })),
    [modules, moduleLabels]
  );

  if (auth.userId === 'anonymous' || auth.actorType !== 'portal') {
    return <Navigate to="/login" replace />;
  }

  const activeRole = auth.activeRole ?? (auth.roles.length === 1 ? auth.roles[0] : null);
  if (!activeRole) {
    return <RoleSelectPage roles={auth.roles} copy={copy} roleLabel={localizedRoleLabel} />;
  }
  const activeRoleLabel = localizedRoleLabel(activeRole);

  const roleModuleKeys = roleModules(activeRole);
  const moduleByKey = new Map(localizedModules.map((module) => [module.key, module]));
  const orderedRoleModules = roleModuleKeys
    .map((key) => moduleByKey.get(key))
    .filter((module): module is typeof localizedModules[number] => Boolean(module));
  const allowedLookup = new Map<string, typeof localizedModules[number]>();
  orderedRoleModules.forEach((module) => {
    if (canReadModule(auth.permissions, module.key)) {
      allowedLookup.set(module.key, module);
    }
  });
  localizedModules.forEach((module) => {
    if (!allowedLookup.has(module.key) && canReadModule(auth.permissions, module.key)) {
      allowedLookup.set(module.key, module);
    }
  });
  const allowedModules = Array.from(allowedLookup.values());
  const extraModules = localizedModules.filter((module) => {
    const hasPermissions = Array.isArray(module.permissions) && module.permissions.length > 0;
    if (hasPermissions) {
      return false;
    }
    return !roleModuleKeys.includes(module.key);
  });
  const navigationModules = [...allowedModules, ...extraModules];
  const primaryRoute = allowedModules[0]?.route ?? '/';
  const currentSearch = typeof window !== 'undefined' ? window.location.search : '';

  if (allowedModules.length === 0) {
    const roleLabelText = activeRoleLabel;
    return (
      <main className="k-page" data-testid="access-denied-page">
        <StateView
          title={copy.accessDeniedTitle ?? 'Přístup odepřen'}
          description={
            copy.accessDeniedNoModules
              ? copy.accessDeniedNoModules(roleLabelText, auth.userId)
              : `Role ${roleLabelText} (uživatel ${auth.userId}) nemá žádné dostupné moduly.`
          }
          stateKey="error"
        />
      </main>
    );
  }

  const isAllowed = (moduleKey: string): boolean => canReadModule(auth.permissions, moduleKey);
  const renderAccessDenied = React.useCallback(
    (moduleKey: string) => (
      <AccessDeniedPage
        moduleLabel={localizedModuleLabel(moduleKey)}
        roleLabel={activeRoleLabel}
        userId={auth.userId}
        copy={copy}
      />
    ),
    [activeRoleLabel, auth.userId, copy, localizedModuleLabel]
  );

  return (
    <AppShell
      panelLayout="portal"
      modules={navigationModules}
      navigationRules={navigationRules}
      navigationSections={navigationSections}
      currentPath={currentPath}
    >
      <Routes>
        <Route
          path="/"
          element={primaryRoute !== '/' ? <Navigate to={`${primaryRoute}${currentSearch}`} replace /> : <deps.Dashboard />}
        />
        <Route path="/pokojska" element={isAllowed('housekeeping') ? <deps.HousekeepingForm /> : renderAccessDenied('housekeeping')} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <deps.BreakfastList /> : renderAccessDenied('breakfast')} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') ? <deps.BreakfastForm mode="create" /> : renderAccessDenied('breakfast')} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') ? <deps.BreakfastDetail /> : renderAccessDenied('breakfast')} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') ? <deps.BreakfastForm mode="edit" /> : renderAccessDenied('breakfast')} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <deps.LostFoundList /> : renderAccessDenied('lost_found')} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="create" /> : renderAccessDenied('lost_found')} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <deps.LostFoundDetail /> : renderAccessDenied('lost_found')} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="edit" /> : renderAccessDenied('lost_found')} />
        <Route path="/zavady" element={isAllowed('issues') ? <deps.IssuesList /> : renderAccessDenied('issues')} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <deps.IssuesForm mode="create" /> : renderAccessDenied('issues')} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <deps.IssuesDetail /> : renderAccessDenied('issues')} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <deps.IssuesForm mode="edit" /> : renderAccessDenied('issues')} />
        <Route path="/sklad" element={isAllowed('inventory') ? <deps.InventoryList /> : renderAccessDenied('inventory')} />
        <Route path="/sklad/nova" element={isAllowed('inventory') ? <deps.InventoryForm mode="create" /> : renderAccessDenied('inventory')} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <deps.InventoryDetail /> : renderAccessDenied('inventory')} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') ? <deps.InventoryForm mode="edit" /> : renderAccessDenied('inventory')} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <deps.ReportsList /> : renderAccessDenied('reports')} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <deps.ReportsForm mode="create" /> : renderAccessDenied('reports')} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <deps.ReportsDetail /> : renderAccessDenied('reports')} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <deps.ReportsForm mode="edit" /> : renderAccessDenied('reports')} />
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
