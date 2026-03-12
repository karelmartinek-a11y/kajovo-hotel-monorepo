import React from 'react';
import { Link } from 'react-router-dom';
import { KajovoFullLockup, StateView } from '@kajovo/ui';

function UtilityLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <main className="k-page k-utility-page">
      <div className="k-utility-stack">{children}</div>
    </main>
  );
}

export function IntroRoute(): JSX.Element {
  return (
    <UtilityLayout>
      <KajovoFullLockup title="KájovoHotel" subtitle="Administrace" href="/admin/" />
      <section className="k-utility-meta" aria-labelledby="admin-intro-title">
        <p className="k-utility-eyebrow">Jedna správa pro provoz, lidi i nastavení</p>
        <h1 id="admin-intro-title">Administrace připravená na každodenní směnu</h1>
        <p className="k-utility-copy">
          Přehled provozu, uživatelů i systémových nastavení držíme v jednom rozhraní,
          aby správce hotelu mohl reagovat bez přepínání mezi improvizovanými nástroji.
        </p>
        <div className="k-state-view-action">
          <Link className="k-button" to="/">
            Otevřít administraci
          </Link>
          <Link className="k-button secondary" to="/uzivatele">
            Správa uživatelů
          </Link>
        </div>
      </section>
    </UtilityLayout>
  );
}

export function OfflineRoute(): JSX.Element {
  return (
    <UtilityLayout>
      <StateView
        title="Administrace je offline"
        description="Správa hotelu ztratila spojení se serverem. Ověřte síť a pak obnovte data, aby se změny nesešly s neaktuálním stavem."
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
        title="Probíhá údržba"
        description="Administrace právě dokončuje servisní zásah. Jakmile bude provoz potvrzený, můžete se vrátit na přehled nebo zkontrolovat diagnostiku."
        stateKey="maintenance"
        action={
          <>
            <Link className="k-button secondary" to="/">
              Zpět na přehled
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
        description="Tuhle administrátorskou stránku jsme nenašli. Vraťte se na přehled nebo pokračujte do správy uživatelů a nastavení."
        stateKey="404"
        action={<Link className="k-button" to="/">Zpět na přehled</Link>}
      />
    </UtilityLayout>
  );
}
