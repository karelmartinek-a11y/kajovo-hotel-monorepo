import React from 'react';
import { Link } from 'react-router-dom';
import { StateView } from '@kajovo/ui';

function UtilityLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <main className="k-page">{children}</main>;
}

export function IntroRoute(): JSX.Element {
  return (
    <UtilityLayout>
      <StateView
        title="Intro"
        description="Úvodní obrazovka aplikace."
        action={<Link className="k-button" to="/">Pokračovat na dashboard</Link>}
      />
    </UtilityLayout>
  );
}

export function OfflineRoute(): JSX.Element {
  return (
    <UtilityLayout>
      <StateView
        title="Offline"
        description="Aplikace je bez připojení. Zkontrolujte síť a zkuste synchronizaci znovu."
        stateKey="offline"
        action={
          <>
            <button className="k-button" type="button" onClick={() => window.location.reload()}>
              Zkusit znovu
            </button>
            <Link className="k-button secondary" to="/">
              Pracovat offline režimem
            </Link>
          </>
        }
      />
    </UtilityLayout>
  );
}

export function MaintenanceRoute(): JSX.Element {
  return (
    <UtilityLayout>
      <StateView
        title="Maintenance"
        description="Probíhá údržba systému. Sledujte status a zkuste to za chvíli znovu."
        stateKey="maintenance"
        action={
          <>
            <Link className="k-button secondary" to="/">
              Zpět na dashboard
            </Link>
            <Link className="k-nav-link" to="/offline">
              Diagnostika provozu
            </Link>
          </>
        }
      />
    </UtilityLayout>
  );
}

export function NotFoundRoute(): JSX.Element {
  return (
    <UtilityLayout>
      <StateView
        title="404"
        description="Stránka nebyla nalezena."
        stateKey="404"
        action={<Link className="k-button" to="/">Zpět na hlavní stránku</Link>}
      />
    </UtilityLayout>
  );
}
