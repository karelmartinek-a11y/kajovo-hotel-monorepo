import React from 'react';
import { useNavigate } from 'react-router-dom';
import { KajovoSign, StateView } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';

export function PortalLoginPage(): JSX.Element {
  const navigate = useNavigate();
  const bundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('portal', lang);
  }, []);
  const { copy, roleLabels } = bundle;

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = bundle.locale;
    document.title = bundle.copy.eyebrow;
  }, [bundle.copy.eyebrow, bundle.locale]);

  const roleLabel = React.useCallback((role: string) => roleLabels[role] ?? role, [roleLabels]);
  const continueAs = React.useCallback(
    (label: string) => (copy.continueAs ? copy.continueAs(label) : `Pokračovat jako ${label}`),
    [copy]
  );

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [roleOptions, setRoleOptions] = React.useState<string[] | null>(null);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInfo(null);
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
    const payload = (await response.json()) as { active_role?: string | null; roles?: string[] };
    if (!payload.active_role && Array.isArray(payload.roles) && payload.roles.length > 1) {
      setRoleOptions(payload.roles);
      return;
    }
    navigate('/');
  }

  async function sendForgotPassword(): Promise<void> {
    setError(null);
    setInfo(null);
    const principal = email.trim();
    if (!principal) {
      setError(copy.emailRequired ?? 'Vyplňte email.');
      return;
    }
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal }),
    });
    if (response.status === 403) {
      setInfo(copy.forgotLockedInfo ?? copy.forgotInfo);
      return;
    }
    setInfo(copy.forgotInfo);
  }

  async function selectRole(role: string): Promise<void> {
    const csrfToken =
      document.cookie
        .split('; ')
        .find((item) => item.startsWith('kajovo_csrf='))
        ?.split('=')[1] ?? '';
    const response = await fetch('/api/auth/select-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': decodeURIComponent(csrfToken) } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      setError(copy.roleSelectError ?? 'Výběr role selhal.');
      return;
    }
    navigate('/');
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
        {authError ? <StateView title="Overeni prihlaseni selhalo" description={authError} stateKey="error" /> : null}
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
          <button
            className="k-button secondary"
            type="button"
            onClick={() => void sendForgotPassword()}
            disabled={!email.trim()}
          >
            {copy.forgotAction}
          </button>
          {error ? (
            <p className="k-login-copy" role="alert">
              {error}
            </p>
          ) : null}
          {info ? <p className="k-login-copy">{info}</p> : null}
          {roleOptions ? (
            <div className="k-toolbar">
              {roleOptions.map((role) => (
                <button
                  key={role}
                  className="k-button secondary"
                  type="button"
                  onClick={() => void selectRole(role)}
                >
                  {continueAs(roleLabel(role))}
                </button>
              ))}
            </div>
          ) : null}
        </form>
      </section>
      <KajovoSign href="/" />
    </main>
  );
}
