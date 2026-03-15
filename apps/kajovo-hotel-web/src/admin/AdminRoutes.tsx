import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { StateView } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';
import { AdminHomePage } from './AdminHomePage';

function AdminSurfaceRetiredPage(): JSX.Element {
  return (
    <main className="k-page" data-testid="admin-surface-retired-page">
      <h1>Admin aplikace</h1>
      <div className="k-card">
        <StateView
          title="Pouzijte samostatny admin"
          description="Sprava uzivatelu a dalsi administrace uz ve webovem portalu nejsou dostupne."
          stateKey="info"
          action={
            <div className="k-toolbar">
              <Link className="k-button" to="/admin/login">
                Otevrit admin aplikaci
              </Link>
              <Link className="k-button secondary" to="/login">
                Portal login
              </Link>
            </div>
          }
        />
      </div>
    </main>
  );
}

export function AdminRoutes({ currentPath: _currentPath }: { currentPath: string }): JSX.Element {
  const adminBundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('admin', lang);
  }, []);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = adminBundle.locale;
    document.title = adminBundle.copy.eyebrow;
  }, [adminBundle.copy.eyebrow, adminBundle.locale]);

  return (
    <Routes>
      <Route path="" element={<AdminHomePage />} />
      <Route path="*" element={<AdminSurfaceRetiredPage />} />
    </Routes>
  );
}
