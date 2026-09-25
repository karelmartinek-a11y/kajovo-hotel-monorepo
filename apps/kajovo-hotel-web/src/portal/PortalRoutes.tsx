import React from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ia from '../../../kajovo-hotel/ux/ia.json';
import { AppShell, Icon, SkeletonPage, StateView } from '@kajovo/ui';
import {
  canReadModule,
  canWriteModule,
  ROLE_MODULES,
  resolveActiveRoleForPermissions,
  type AuthProfile,
  type Role,
} from '../rbac';
import { getAuthBundle, rolePermissionSet, type AuthBundle, setPortalLocale, t, type PortalLocale } from '@kajovo/shared';
import { LocaleSwitcher } from './LocaleSwitcher';

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

export async function requestRoleSelection(role: string): Promise<{ ok: true } | { ok: false; detail?: string }> {
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
  if (response.ok) {
    return { ok: true };
  }
  try {
    const body = await response.json();
    return {
      ok: false,
      detail: body && typeof body.detail === 'string' ? body.detail : undefined,
    };
  } catch {
    return { ok: false };
  }
}

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
    try {
      const result = await requestRoleSelection(role);
      if (!result.ok) {
        setBusy(false);
        setError(result.detail ?? copy.roleSelectError ?? t('Výběr role selhal.'));
        return;
      }
      window.location.assign('/');
    } catch (err) {
      setBusy(false);
      const message =
        err instanceof Error && err.message ? `${err.message}` : (copy.roleSelectError ?? t('Výběr role selhal.'));
      console.error('Role select network error', err);
      setError(message);
    }
  }, [copy]);

  React.useEffect(() => {
    if (roles.length === 1) {
      void selectRole(roles[0]);
    }
  }, [roles, selectRole]);

  return (
    <main className="k-page" data-testid="role-select-page">
      <h1>{copy.roleSelectTitle ?? t('Vyberte roli')}</h1>
      <p className="k-login-copy">{copy.roleSelectDescription ?? t('Pro pokračování zvolte roli, ve které budete pracovat.')}</p>
      <div className="k-toolbar">
        {roles.map((role) => (
          <button key={role} className="k-button" type="button" onClick={() => void selectRole(role)} disabled={busy}>
            {continueAs(roleLabel(role))}
          </button>
        ))}
      </div>
      {error ? <StateView title={copy.accessDeniedTitle ?? t('Přístup odepřen')} description={error} stateKey="error" /> : null}
      {busy ? <SkeletonPage /> : null}
    </main>
  );
}

function ReceptionHubPage(): JSX.Element {
  return (
    <main className="k-page" data-testid="reception-hub-page">
      <h1>{t("Recepce")}</h1>
      <p className="k-login-copy">{t("Vyberte provozní tok, který chcete otevřít. Každá karta vede do plnohodnotného pracovního vstupu, ne jen do stručné zkratky.")}{' '}</p>
      <div className="k-grid cards-3">
        <StateView
          title={t("Zpracování nálezů")}
          description={t("Seznam čekajících nálezů, detail položky a převzetí po recepci.")}
          stateKey="empty"
          action={<Link className="k-button" to="/ztraty-a-nalezy">{t("Otevřít nálezy")}</Link>}
        />
        <StateView
          title={t("Import a správa snídaní")}
          description={t("Denní souhrn, seznam objednávek, detail, založení, úpravy i práce s PDF.")}
          stateKey="empty"
          action={<Link className="k-button" to="/snidane">{t("Otevřít snídaně")}</Link>}
        />
        <StateView
          title={t("Přehled hlášení")}
          description={t("Provozní hlášení s detailem a úpravami dostupnými pro oprávněné role.")}
          stateKey="empty"
          action={<Link className="k-button" to="/hlaseni">{t("Otevřít hlášení")}</Link>}
        />
      </div>
    </main>
  );
}

function AccessDeniedPage({ moduleLabel, roleLabel, userId, copy }: AccessDeniedProps): JSX.Element {
  const title = copy.accessDeniedTitle ?? t('Přístup odepřen');
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
          <Link className="k-button secondary" to="/">{t("Zpět na přehled")}{' '}</Link>
        }
      />
    </main>
  );
}

type PortalRouteDeps = {
  Dashboard: () => JSX.Element;
  PortalProfilePage: () => JSX.Element;
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
  const bundle = React.useMemo(() => getAuthBundle('portal', auth.preferredLocale), [auth.preferredLocale]);
  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = bundle.locale;
    document.title = bundle.copy.eyebrow;
  }, [bundle.copy.eyebrow, bundle.locale]);
  const { copy, roleLabels, moduleLabels, navigation } = bundle;
  const localizedRoleLabel = React.useCallback(
    (role: string) => roleLabels[role] ?? role,
    [roleLabels]
  );
  const localizedModuleLabel = React.useCallback(
    (key: string) => moduleLabels[key] ?? key,
    [moduleLabels]
  );
  const localizedModules = React.useMemo(
    () =>
      modules.map((module) => ({
        ...module,
        label: moduleLabels[module.key] ?? module.label,
      })),
    [modules, moduleLabels]
  );
  const [switchError, setSwitchError] = React.useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = React.useState(false);
  const [logoutBusy, setLogoutBusy] = React.useState(false);
  const [localeBusy, setLocaleBusy] = React.useState(false);
  const [localeError, setLocaleError] = React.useState<string | null>(null);
  const changeLocale = React.useCallback(async (locale: PortalLocale) => {
    if (locale === auth.preferredLocale) return;
    setLocaleBusy(true);
    setLocaleError(null);
    try {
      const csrf = readCsrfToken();
      const response = await fetch('/api/auth/locale', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': decodeURIComponent(csrf) },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) throw new Error(t('Jazyk se nepodařilo uložit. Zkuste to znovu.'));
      setPortalLocale(locale);
      window.location.reload();
    } catch (error) {
      setLocaleBusy(false);
      setLocaleError(error instanceof Error ? error.message : t('Jazyk se nepodařilo uložit.'));
    }
  }, [auth.preferredLocale]);

  if (auth.actorType !== 'portal') {
    return <Navigate to="/login" replace />;
  }

  const assignedRoles = auth.roles;
  const activeRole = resolveActiveRoleForPermissions(assignedRoles, auth.activeRole, auth.permissions);
  if (assignedRoles.length === 0) {
    return (
      <main className="k-page" data-testid="access-denied-page">
        <StateView
          title={copy.accessDeniedTitle ?? t('Přístup odepřen')}
          description={
            copy.accessDeniedNoModules
              ? copy.accessDeniedNoModules(localizedRoleLabel(auth.role), auth.userId)
              : `Uživatel ${auth.userId} nemá žádnou roli s dostupnými moduly.`
          }
          stateKey="error"
        />
      </main>
    );
  }
  if (!activeRole) {
    return <RoleSelectPage roles={assignedRoles} copy={copy} roleLabel={localizedRoleLabel} />;
  }
  const activeRoleLabel = localizedRoleLabel(activeRole);
  const switchRole = React.useCallback(async (role: string, route: string) => {
    setSwitchError(null);
    setSwitchBusy(true);
    try {
      const result = await requestRoleSelection(role);
      if (!result.ok) {
        setSwitchBusy(false);
        setSwitchError(result.detail ?? copy.roleSelectError ?? t('Výběr role selhal.'));
        return;
      }
      window.location.assign(route);
    } catch (err) {
      setSwitchBusy(false);
      setSwitchError(err instanceof Error && err.message ? err.message : (copy.roleSelectError ?? t('Výběr role selhal.')));
    }
  }, [copy.roleSelectError]);
  const logout = React.useCallback(async () => {
    setLogoutBusy(true);
    setSwitchError(null);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': decodeURIComponent(readCsrfToken()) },
      });
      if (!response.ok) throw new Error(t('Odhlášení se nepodařilo dokončit.'));
      window.location.assign('/login');
    } catch (error) {
      setLogoutBusy(false);
      setSwitchError(error instanceof Error ? error.message : t('Odhlášení se nepodařilo dokončit.'));
    }
  }, []);

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
  const primaryRoute = activeRole === 'recepce' ? '/recepce' : (allowedModules[0]?.route ?? '/');
  const currentSearch = typeof window !== 'undefined' ? window.location.search : '';

  if (allowedModules.length === 0) {
    const roleLabelText = activeRoleLabel;
    return (
      <main className="k-page" data-testid="access-denied-page">
        <StateView
          title={copy.accessDeniedTitle ?? t('Přístup odepřen')}
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
  const breakfastManager = activeRole === 'recepce';
  const inventoryManager = activeRole === 'sklad';
  const reportsWriter = canWriteModule(auth.permissions, 'reports');
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

  const tabs = [
    { key: 'profile', label: moduleLabels.profile, route: '/profil', icon: 'profile', module: null, role: null, paths: ['/profil'] },
    { key: 'housekeeping', label: localizedRoleLabel('pokojská'), route: '/pokojska', icon: 'bed', module: 'housekeeping', role: 'pokojská' as Role, paths: ['/pokojska'] },
    { key: 'reception', label: localizedRoleLabel('recepce'), route: '/recepce', icon: 'briefcase', module: 'lost_found', role: 'recepce' as Role, paths: ['/recepce', '/ztraty-a-nalezy', '/hlaseni'] },
    { key: 'breakfast', label: localizedRoleLabel('snídaně'), route: '/snidane', icon: 'utensils', module: 'breakfast', role: 'snídaně' as Role, paths: ['/snidane'] },
    { key: 'maintenance', label: localizedRoleLabel('údržba'), route: '/zavady', icon: 'tool', module: 'issues', role: 'údržba' as Role, paths: ['/zavady'] },
  ].filter((tab) => !tab.module || canReadModule(auth.permissions, tab.module) || (tab.role && assignedRoles.includes(tab.role) && canReadModule(rolePermissionSet(tab.role), tab.module)));
  const portalTabs = tabs.map((tab) => {
    const selected = tab.paths.some((path) => currentPath === path || currentPath.startsWith(`${path}/`));
    const needsRoleSwitch = tab.module && !canReadModule(auth.permissions, tab.module) && tab.role && tab.role !== activeRole;
    const content = <><Icon name={tab.icon} className="k-nav-link__icon" /><span className="k-portal-mobile-tabs__label">{tab.label}</span></>;
    return needsRoleSwitch ? (
      <button key={tab.key} className="k-portal-mobile-tabs__link" type="button" aria-label={tab.label} aria-current={selected ? 'page' : undefined} disabled={switchBusy} onClick={() => void switchRole(tab.role!, tab.route)}>{content}</button>
    ) : (
      <Link key={tab.key} className="k-portal-mobile-tabs__link" to={tab.route} aria-label={tab.label} aria-current={selected ? 'page' : undefined}>{content}</Link>
    );
  });

  return (
    <AppShell
      panelLayout="portal"
      modules={[]}
      navigationRules={{ grouping: false, ariaLabel: navigation.ariaLabel }}
      currentPath={currentPath}
      portalTabs={portalTabs}
      headerControls={(
        <><LocaleSwitcher locale={auth.preferredLocale} onSelect={(locale) => void changeLocale(locale)} busy={localeBusy} />
        <button className="k-portal-logout" type="button" aria-label={t('Odhlásit')} title={t('Odhlásit')} disabled={logoutBusy} onClick={() => void logout()}><Icon name="logout" /></button></>
      )}
    >
      {switchError ? <div className="k-shell-inner"><StateView title={copy.accessDeniedTitle ?? t('Přístup odepřen')} description={switchError} stateKey="error" /></div> : null}
      {localeError ? <div className="k-shell-inner" role="alert">{localeError}</div> : null}
      <Routes>
        <Route
          path="/"
          element={primaryRoute !== '/' ? <Navigate to={`${primaryRoute}${currentSearch}`} replace /> : <deps.Dashboard />}
        />
        <Route path="/recepce" element={activeRole === 'recepce' ? <ReceptionHubPage /> : <Navigate to={`${primaryRoute}${currentSearch}`} replace />} />
        <Route path="/profil" element={<deps.PortalProfilePage />} />
        <Route path="/pokojska" element={isAllowed('housekeeping') ? <deps.HousekeepingForm /> : renderAccessDenied('housekeeping')} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <deps.BreakfastList /> : renderAccessDenied('breakfast')} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') && breakfastManager ? <deps.BreakfastForm mode="create" /> : renderAccessDenied('breakfast')} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') && breakfastManager ? <deps.BreakfastDetail /> : renderAccessDenied('breakfast')} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') && breakfastManager ? <deps.BreakfastForm mode="edit" /> : renderAccessDenied('breakfast')} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <deps.LostFoundList /> : renderAccessDenied('lost_found')} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="create" /> : renderAccessDenied('lost_found')} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <deps.LostFoundDetail /> : renderAccessDenied('lost_found')} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="edit" /> : renderAccessDenied('lost_found')} />
        <Route path="/zavady" element={isAllowed('issues') ? <deps.IssuesList /> : renderAccessDenied('issues')} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <deps.IssuesForm mode="create" /> : renderAccessDenied('issues')} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <deps.IssuesDetail /> : renderAccessDenied('issues')} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <deps.IssuesForm mode="edit" /> : renderAccessDenied('issues')} />
        <Route path="/sklad" element={isAllowed('inventory') ? <deps.InventoryList /> : renderAccessDenied('inventory')} />
        <Route path="/sklad/nova" element={isAllowed('inventory') && inventoryManager ? <deps.InventoryForm mode="create" /> : renderAccessDenied('inventory')} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <deps.InventoryDetail /> : renderAccessDenied('inventory')} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') && inventoryManager ? <deps.InventoryForm mode="edit" /> : renderAccessDenied('inventory')} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <deps.ReportsList /> : renderAccessDenied('reports')} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') && reportsWriter ? <deps.ReportsForm mode="create" /> : renderAccessDenied('reports')} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <deps.ReportsDetail /> : renderAccessDenied('reports')} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') && reportsWriter ? <deps.ReportsForm mode="edit" /> : renderAccessDenied('reports')} />
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
