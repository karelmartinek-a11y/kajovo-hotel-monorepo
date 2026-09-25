import React from 'react';
import { Icon, KajovoFullLockup } from '@kajovo/ui';
import { getAuthBundle, setPortalLocale, t, type PortalLocale } from '@kajovo/shared';
import { LocaleSwitcher } from './LocaleSwitcher';

type PortalLoginPageProps = {
  initialError?: string | null;
};

async function readLoginError(response: Response, fallback: string): Promise<string> {
  await response.body?.cancel();
  if (response.status === 401) {
    return t('Neplatné uživatelské jméno nebo heslo.');
  }
  return fallback;
}

export function PortalLoginPage({ initialError = null }: PortalLoginPageProps = {}): JSX.Element {
  const [locale, setLocale] = React.useState<PortalLocale>(() => { setPortalLocale('cs'); return 'cs'; });
  const bundle = React.useMemo(() => getAuthBundle('portal', locale), [locale]);
  const { copy } = bundle;

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = bundle.locale;
    document.title = bundle.copy.eyebrow;
  }, [bundle.copy.eyebrow, bundle.locale]);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(initialError);

  React.useEffect(() => {
    setError(initialError);
  }, [initialError]);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const principal = email.trim();
    if (!principal || !password) {
      setError(copy.credentialsRequired ?? copy.loginError ?? t('Vyplňte uživatelské jméno i heslo.'));
      return;
    }
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal, password, web_activity_session: true }),
    });
    if (!response.ok) {
      setError(await readLoginError(response, copy.loginError ?? t('Přihlášení se nepodařilo.')));
      return;
    }
    window.location.assign('/');
  }

  return (
    <main className="k-login-page" data-testid="portal-login-page">
      <section className="k-login-card" aria-labelledby="portal-login-title">
        <LocaleSwitcher locale={locale} onSelect={(value) => { setPortalLocale(value); setLocale(value); }} />
        <KajovoFullLockup href="/" title={t("Kájovo Hotel")} subtitle={t("Provozní portál")} />
        <p className="k-login-eyebrow">{copy.eyebrow}</p>
        <h1 id="portal-login-title">{t("Vítejte v Kájovo Hotel")}</h1>
        <p className="k-login-copy">{t("Přihlaste se do provozního portálu. Po ověření účtu navážete přesně tam, kde začíná dnešní směna.")}{' '}</p>
        <section className="k-login-download k-login-download--mobile-only" data-testid="android-app-download" aria-labelledby="android-app-download-title">
          <h2 id="android-app-download-title" className="k-login-download__title">{t("Kájovo Hotel pro Android")}</h2>
          <p className="k-login-download__copy">{t("Stáhněte si plně nativní aplikaci pro rychlý přístup k hotelovému provozu.")}{' '}</p>
          <a
            className="k-button k-login-download__action"
            href="/downloads/kajovo-hotel-android.apk"
            download="kajovo-hotel-android.apk"
            data-testid="android-app-download-link"
          >{t("Stáhnout aplikaci pro Android")}{' '}</a>
          <p className="k-login-download__meta">{t("Verze 2.0.4 NG · instalace APK")}</p>
        </section>
        <form className="k-login-form" onSubmit={(event) => void login(event)}>
          <label className="k-login-label" htmlFor="portal-email">{t("Uživatelské jméno")}{' '}</label>
          <input
            id="portal-email"
            className="k-input"
            type="email"
            value={email}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            spellCheck={false}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="k-login-label" htmlFor="portal-password">
            {copy.passwordLabel}
          </label>
          <input
            id="portal-password"
            className="k-input"
            type="password"
            value={password}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="k-button" type="submit">{t("Přihlásit")}{' '}</button>
          {error ? (
            <p className="k-login-copy" role="alert">
              {error}
            </p>
          ) : null}
          <p className="k-login-copy">{t("Reset hesla je samostatný tok z odkazu správce.")}</p>
        </form>
      </section>
      <aside className="k-login-preview" aria-label={t("Přehled provozního portálu")}>
        <div className="k-card">
          <div className="k-card__header">
            <div className="k-card__title-wrap">
              <p className="k-card__eyebrow">{t("Dnešní provoz")}</p>
              <h3>{t("Jedno rozhraní pro celou směnu")}</h3>
            </div>
            <Icon name="layout-dashboard" className="k-card__icon" title={t("Přehled")} />
          </div>
          <div className="k-card__body k-grid">
            <div className="k-nav-link"><Icon name="utensils" className="k-nav-link__icon" /><span>{t("Snídaně")}</span></div>
            <div className="k-nav-link"><Icon name="tool" className="k-nav-link__icon" /><span>{t("Závady a pokojská")}</span></div>
            <div className="k-nav-link"><Icon name="search" className="k-nav-link__icon" /><span>{t("Ztráty a nálezy")}</span></div>
            <div className="k-nav-link"><Icon name="file-text" className="k-nav-link__icon" /><span>{t("Hlášení, profil a směnové úkoly")}</span></div>
          </div>
        </div>
      </aside>
    </main>
  );
}
