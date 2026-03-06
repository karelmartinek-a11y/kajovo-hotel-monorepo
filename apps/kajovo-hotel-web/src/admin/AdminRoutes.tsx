import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';
import ia from '../../../kajovo-hotel/ux/ia.json';
import { AdminHomePage } from './AdminHomePage';
import { UsersAdmin } from './UsersAdmin';

const ADMIN_MODULE_KEYS = ['breakfast', 'inventory', 'issues', 'housekeeping', 'lost_found'] as const;
const ADMIN_EXTRA_MODULES = [
  {
    key: 'users',
    label: 'Uživatelé',
    route: '/uzivatele',
    icon: 'users',
    active: true,
    section: 'records',
    permissions: ['read', 'write'] as string[],
  },
] as const;

export function AdminRoutes({ currentPath }: { currentPath: string }): JSX.Element {
  const adminBundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('admin', lang);
  }, []);
  const allowFigure = (ia.brandPolicy?.maxBrandElementsPerView ?? 3) > 2;
  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = adminBundle.locale;
    document.title = adminBundle.copy.eyebrow;
  }, [adminBundle.copy.eyebrow, adminBundle.locale]);

  const { navigation, moduleLabels, sectionLabels } = adminBundle;
  const adminModules = React.useMemo(
    () => {
      const modulesByKey = new Map(ia.modules.map((module) => [module.key, module]));
      return ADMIN_MODULE_KEYS
        .map((key) => modulesByKey.get(key))
        .filter((module): module is (typeof ia.modules)[number] => Boolean(module))
        .map((module) => ({
          ...module,
          label: moduleLabels[module.key] ?? module.label,
        }));
    },
    [moduleLabels]
  );
  const extraAdminModules = React.useMemo(
    () =>
      ADMIN_EXTRA_MODULES.map((module) => ({
        ...module,
        label: module.label,
      })),
    []
  );
  const modulesForShell = React.useMemo(
    () => [...adminModules, ...extraAdminModules],
    [adminModules, extraAdminModules]
  );

  const localizedNavigationRules = React.useMemo(
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

  const localizedSections = React.useMemo(
    () =>
      ia.navigation.sections.map((section) => ({
        ...section,
        label: sectionLabels[section.key] ?? section.label,
      })),
    [sectionLabels['overview'], sectionLabels['operations'], sectionLabels['records']]
  );

  return (
    <Routes>
      <Route
        path="*"
        element={
          <AppShell
            panelLayout="admin"
            modules={modulesForShell}
            navigationRules={localizedNavigationRules}
            navigationSections={localizedSections}
            currentPath={currentPath}
            showFigure={allowFigure}
          >
            <Routes>
              <Route path="" element={<AdminHomePage />} />
              <Route path="uzivatele" element={<UsersAdmin />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
}
