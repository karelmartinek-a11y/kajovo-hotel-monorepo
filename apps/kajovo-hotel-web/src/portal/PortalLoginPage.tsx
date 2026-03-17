import React from 'react';
import { KajovoSign } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';

export function PortalLoginPage(): JSX.Element {
  const bundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('portal', lang);
  }, []);
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
  const [error, setError] = React.useState<string | null>(null);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const principal = email.trim();
    if (!principal || !password) {
      setError(copy.credentialsRequired ?? copy.loginError ?? 'Neplatné přihlašovací údaje.');
      return;
    }
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal, password }),
    });
    if (!response.ok) {
      setError(copy.loginError ?? 'Neplatné přihlašovací údaje.');
      return;
    }
    window.location.assign('/');
  }

  return (
    <main className="k-login-page" data-testid="portal-login-page">
      <section className="k-login-card" aria-labelledby="portal-login-title">
        <img
          className="k-login-wordmark"
          src="/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg"
          alt="KájovoHotel wordmark"
          loading="lazy"
        />
        <p className="k-login-eyebrow">{copy.eyebrow}</p>
        <h1 id="portal-login-title">{copy.title}</h1>
        <p className="k-login-copy">{copy.description}</p>
        <form className="k-login-form" onSubmit={(event) => void login(event)}>
          <label className="k-login-label" htmlFor="portal-email">
            {copy.emailLabel}
          </label>
          <input
            id="portal-email"
            className="k-input"
            type="email"
            value={email}
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
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="k-button" type="submit">
            {copy.loginAction}
          </button>
          {error ? (
            <p className="k-login-copy" role="alert">
              {error}
            </p>
          ) : null}
          <p className="k-login-copy">Reset hesla odesílá pouze administrátor ze správy uživatelů.</p>
        </form>
        <section className="k-login-download" aria-labelledby="portal-download-title">
          <h2 id="portal-download-title" className="k-login-download__title">
            Stáhnout Android aplikaci
          </h2>
          <p className="k-login-download__copy">
            Pro přihlášení z telefonu nebo tabletu si můžeš stáhnout instalační APK balíček.
          </p>
          <a
            className="k-button k-login-download__action"
            href="/downloads/kajovo-hotel-android.apk"
            download="kajovo-hotel-android.apk"
          >
            Stáhnout APK
          </a>
        </section>
      </section>
      <KajovoSign href="/" />
    </main>
  );
}
