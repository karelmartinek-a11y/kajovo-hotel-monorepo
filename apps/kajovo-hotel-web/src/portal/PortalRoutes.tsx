import React from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ia from '../../../kajovo-hotel/ux/ia.json';
import { AppShell, SkeletonPage } from '@kajovo/ui';
import { canReadModule, type AuthProfile } from '../rbac';

type AccessDeniedProps = {
  moduleLabel: string;
  role: string;
  userId: string;
};

function AccessDeniedPage({ moduleLabel, role, userId }: AccessDeniedProps): JSX.Element {
  return (
    <main className="k-page" data-testid="access-denied-page">
      <p>Role {role} (uživatel {userId}) nemá oprávnění pro modul {moduleLabel}.</p>
      <Link className="k-button secondary" to="/">Zpět na přehled</Link>
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
  const isAllowed = (moduleKey: string): boolean => canReadModule(auth.permissions, moduleKey);

  return (
    <AppShell
      panelLayout="portal"
      modules={modules}
      navigationRules={ia.navigation.rules}
      navigationSections={ia.navigation.sections}
      currentPath={currentPath}
    >
      <Routes>
        <Route path="/" element={isAllowed('dashboard') ? <deps.Dashboard /> : <AccessDeniedPage moduleLabel="Přehled" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <deps.BreakfastList /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') ? <deps.BreakfastForm mode="create" /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') ? <deps.BreakfastDetail /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') ? <deps.BreakfastForm mode="edit" /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <deps.LostFoundList /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="create" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <deps.LostFoundDetail /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <deps.LostFoundForm mode="edit" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady" element={isAllowed('issues') ? <deps.IssuesList /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <deps.IssuesForm mode="create" /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <deps.IssuesDetail /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <deps.IssuesForm mode="edit" /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad" element={isAllowed('inventory') ? <deps.InventoryList /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/nova" element={isAllowed('inventory') ? <deps.InventoryForm mode="create" /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <deps.InventoryDetail /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') ? <deps.InventoryForm mode="edit" /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <deps.ReportsList /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <deps.ReportsForm mode="create" /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <deps.ReportsDetail /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <deps.ReportsForm mode="edit" /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
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
