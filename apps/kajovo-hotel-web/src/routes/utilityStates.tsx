import React from 'react';
import { Link } from 'react-router-dom';
import { KajovoFullLockup, StateView } from '@kajovo/ui';
import { t } from '@kajovo/shared';

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
      <KajovoFullLockup title={t("Kájovo Hotel")} subtitle={t("Provozní portál")} href="/" />
      <section className="k-utility-meta" aria-labelledby="portal-intro-title">
        <p className="k-utility-eyebrow">{t("Připraveno pro telefon, tablet i desktop")}</p>
        <h1 id="portal-intro-title">{t("Provoz hotelu bez zbytečných přepínačů")}</h1>
        <p className="k-utility-copy">{t("Recepce, pokojská, údržba i sklad mají společný pracovní rytmus, jasné stavy a bezpečný přístup k tomu, co právě potřebují.")}{' '}</p>
        <div className="k-state-view-action">
          <Link className="k-button" to="/">{t("Vstoupit do portálu")}{' '}</Link>
          <Link className="k-button secondary" to="/snidane">{t("Otevřít dnešní provoz")}{' '}</Link>
        </div>
      </section>
    </UtilityLayout>
  );
}

export function OfflineRoute(): JSX.Element {
  return (
    <UtilityLayout>
      <StateView
        title={t("Jste offline")}
        description={t("Portál ztratil připojení. Zkontrolujte síť, případně pokračujte v úkolech, které nevyžadují online synchronizaci.")}
        stateKey="offline"
        action={
          <>
            <button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Zkusit znovu")}{' '}</button>
            <Link className="k-button secondary" to="/">{t("Pracovat offline režimem")}{' '}</Link>
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
        title={t("Probíhá údržba")}
        description={t("Portál právě dokončuje servisní zásah. Sledujte provozní diagnostiku a po obnovení navazujte tam, kde jste skončili.")}
        stateKey="maintenance"
        action={
          <>
            <Link className="k-button secondary" to="/">{t("Zpět na přehled")}{' '}</Link>
            <Link className="k-nav-link" to="/offline">{t("Diagnostika provozu")}{' '}</Link>
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
        description={t("Tuhle stránku jsme v portálu nenašli. Vraťte se na přehled nebo pokračujte do provozních modulů.")}
        stateKey="404"
        action={<Link className="k-button" to="/">{t("Zpět na přehled")}</Link>}
      />
    </UtilityLayout>
  );
}
