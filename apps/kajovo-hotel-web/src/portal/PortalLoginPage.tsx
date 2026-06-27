import React from 'react';
import { Icon, KajovoFullLockup } from '@kajovo/ui';
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
        <KajovoFullLockup href="/" title="Kájovo Hotel" subtitle="Provozní portál" />
        <p className="k-login-eyebrow">{copy.eyebrow}</p>
        <h1 id="portal-login-title">Vítejte v Kájovo Hotel</h1>
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
      </section>
      <aside className="k-login-preview" aria-label="Přehled provozního portálu">
        <div className="k-card">
          <div className="k-card__header">
            <div className="k-card__title-wrap">
              <p className="k-card__eyebrow">Dnešní provoz</p>
              <h3>Jedno rozhraní pro celou směnu</h3>
            </div>
            <Icon name="layout-dashboard" className="k-card__icon" title="Přehled" />
          </div>
          <div className="k-card__body k-grid">
            <div className="k-nav-link"><Icon name="utensils" className="k-nav-link__icon" /><span>Snídaně a importy</span></div>
            <div className="k-nav-link"><Icon name="tool" className="k-nav-link__icon" /><span>Závady a pokojská</span></div>
            <div className="k-nav-link"><Icon name="search" className="k-nav-link__icon" /><span>Ztráty a nálezy</span></div>
            <div className="k-nav-link"><Icon name="file-text" className="k-nav-link__icon" /><span>Hlášení, profil a směnové úkoly</span></div>
          </div>
        </div>
      </aside>
    </main>
  );
}
