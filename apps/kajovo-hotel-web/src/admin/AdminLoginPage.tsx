import React from 'react';
import { KajovoSign, StateView } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';

const adminMascot = '/brand/postavy/kaja-admin.png';

export function AdminLoginPage({ authError = null }: { authError?: string | null }): JSX.Element {
  const bundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('admin', lang);
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
  const [hintStatus, setHintStatus] = React.useState<string | null>(null);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setHintStatus(null);
    const principal = email.trim();
    if (!principal || !password) {
      setError(copy.credentialsRequired ?? copy.loginError ?? 'Neplatné přihlašovací údaje.');
      return;
    }
    const response = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal, password }),
    });
    if (!response.ok) {
      setError(copy.loginError ?? 'Neplatné přihlašovací údaje.');
      return;
    }
    window.location.assign('/admin/');
  }

  async function sendPasswordHint(): Promise<void> {
    setHintStatus(null);
    const response = await fetch('/api/auth/admin/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      setHintStatus(copy.hintInfo ?? 'Pokud účet existuje, byl odeslán odkaz pro odblokování.');
      return;
    }
    setHintStatus(copy.hintInfo ?? 'Pokud účet existuje, byl odeslán odkaz pro odblokování.');
  }

  return (
    <main className="k-login-page" data-testid="admin-login-page">
      <section className="k-login-card" aria-labelledby="admin-login-title">
        <img className="k-login-wordmark" src="/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg" alt="KájovoHotel wordmark" loading="lazy" />
        <p className="k-login-eyebrow">{copy.eyebrow}</p>
        <h1 id="admin-login-title">{copy.title}</h1>
        <p className="k-login-copy" id="admin-login-description">{copy.description}</p>
        {authError ? <StateView title="Overeni prihlaseni selhalo" description={authError} stateKey="error" /> : null}
        <form className="k-login-form" onSubmit={(event) => void login(event)}>
          <label className="k-login-label" htmlFor="admin-email">{copy.emailLabel}</label>
          <input
            id="admin-email"
            className="k-input"
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder="provoz@hotelchodovasc.cz"
            aria-describedby="admin-login-description"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="k-login-label" htmlFor="admin-password">{copy.passwordLabel}</label>
          <input
            id="admin-password"
            className="k-input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-describedby="admin-login-description"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="k-button" type="submit">{copy.loginAction}</button>
          <button className="k-button secondary" type="button" onClick={() => void sendPasswordHint()} disabled={!email.trim()}>
            {copy.hintAction ?? copy.forgotAction}
          </button>
          {error ? <p id="admin-login-error" className="k-login-copy" role="alert">{error}</p> : null}
          {hintStatus ? <p id="admin-login-hint" className="k-login-copy" role="status">{hintStatus}</p> : null}
        </form>
      </section>
      <aside className="k-login-preview" aria-label="Ilustrace Kája">
        <img src={adminMascot} alt="Ilustrace Kája pro admin login" loading="lazy" />
      </aside>
      <KajovoSign />
    </main>
  );
}
