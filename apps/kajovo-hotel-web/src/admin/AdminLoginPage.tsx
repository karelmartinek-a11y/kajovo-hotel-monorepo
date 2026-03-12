import React from 'react';
import { KajovoSign } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';


type LoginErrorState = {
  title: string;
  description: string;
};

export function AdminLoginPage(): JSX.Element {
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
  const [loginError, setLoginError] = React.useState<LoginErrorState | null>(null);
  const [hintStatus, setHintStatus] = React.useState<string | null>(null);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoginError(null);
    setHintStatus(null);
    const principal = email.trim();
    if (!principal || !password) {
      setLoginError({
        title: copy.loginErrorTitle ?? 'Přihlášení se nezdařilo',
        description: copy.credentialsRequired ?? copy.loginError ?? 'Vyplňte email i heslo.',
      });
      return;
    }
    const response = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal, password }),
    });
    if (!response.ok) {
      const locked = response.status === 423;
      setLoginError({
        title: copy.loginErrorTitle ?? 'Přihlášení se nezdařilo',
        description: locked
          ? (copy.accountLockedError ?? 'Účet je dočasně uzamčen. Použijte odkaz pro odblokování účtu.')
          : (copy.loginErrorHelp ?? copy.loginError ?? 'Zkontrolujte přihlašovací údaje a zkuste to znovu.'),
      });
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
          {loginError ? (
            <section className="k-login-feedback" role="alert" aria-live="assertive" aria-labelledby="admin-login-error-title" aria-describedby="admin-login-error-description">
              <h2 id="admin-login-error-title" className="k-login-feedback-title">{loginError.title}</h2>
              <p id="admin-login-error-description" className="k-login-feedback-description">{loginError.description}</p>
            </section>
          ) : null}
          {hintStatus ? <p id="admin-login-hint" className="k-login-copy" role="status">{hintStatus}</p> : null}
        </form>
      </section>
      <KajovoSign />
    </main>
  );
}

