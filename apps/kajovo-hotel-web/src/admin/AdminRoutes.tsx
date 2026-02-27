import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@kajovo/ui';
import ia from '../../../kajovo-hotel/ux/ia.json';
import { AdminHomePage } from './AdminHomePage';

export function AdminRoutes({ currentPath }: { currentPath: string }): JSX.Element {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <AppShell
            panelLayout="admin"
            modules={[]}
            navigationRules={ia.navigation.rules}
            navigationSections={ia.navigation.sections}
            currentPath={currentPath}
          >
            <Routes>
              <Route path="" element={<AdminHomePage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
}
