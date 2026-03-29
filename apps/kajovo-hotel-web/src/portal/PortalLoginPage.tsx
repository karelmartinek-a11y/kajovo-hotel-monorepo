import React from 'react';
import { KajovoFullLockup, KajovoSign } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';

type PortalLoginPageProps = {
  initialError?: string | null;
};

async function readLoginError(response: Response, fallback: string): Promise<string> {
  const raw = await response.text();
  if (!raw.trim()) {
    return fallback;
  }
  try {
    const payload = JSON.parse(raw) as { detail?: unknown };
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      if (response.status === 401) {
        return 'Neplatné uživatelské jméno nebo heslo.';
      }
      return payload.detail.trim();
    }
  } catch {
    // Odpověď není JSON, vracíme fallback nebo raw text.
  }
  if (response.status === 401) {
    return 'Neplatné uživatelské jméno nebo heslo.';
  }
  return raw.trim() || fallback;
}

export function PortalLoginPage({ initialError = null }: PortalLoginPageProps = {}): JSX.Element {
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
  const [error, setError] = React.useState<string | null>(initialError);

  React.useEffect(() => {
    setError(initialError);
  }, [initialError]);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const principal = email.trim();
    if (!principal || !password) {
      setError(copy.credentialsRequired ?? copy.loginError ?? 'Vyplňte uživatelské jméno i heslo.');
      return;
    }
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal, password }),
    });
    if (!response.ok) {
      setError(await readLoginError(response, copy.loginError ?? 'Přihlášení se nepodařilo.'));
      return;
    }
    window.location.assign('/');
  }

  return (
    <main className="k-login-page" data-testid="portal-login-page">
      <section className="k-login-card" aria-labelledby="portal-login-title">
        <KajovoFullLockup href="/" title="KájovoHotel" subtitle="Provozní portál" />
        <p className="k-login-eyebrow">{copy.eyebrow}</p>
        <h1 id="portal-login-title">Vítejte v KájovoHotel</h1>
        <p className="k-login-copy">
          Přihlaste se do provozního portálu. Po ověření účtu navážete přesně tam, kde začíná dnešní směna.
        </p>
        <form className="k-login-form" onSubmit={(event) => void login(event)}>
          <label className="k-login-label" htmlFor="portal-email">
            Uživatelské jméno
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
            Přihlásit
          </button>
          {error ? (
            <p className="k-login-copy" role="alert">
              {error}
            </p>
          ) : null}
          <p className="k-login-copy">Reset hesla je samostatný tok z odkazu správce.</p>
        </form>
        <section className="k-login-download" aria-labelledby="portal-download-title">
          <h2 id="portal-download-title" className="k-login-download__title">
            Stáhnout Android aplikaci
          </h2>
          <div className="k-login-download__preview" aria-hidden="true">
            <img src="/downloads/kajovo-hotel-android-icon.png" alt="" />
          </div>
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
