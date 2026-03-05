import React from 'react';
import { useNavigate } from 'react-router-dom';
import { KajovoSign } from '@kajovo/ui';

const portalMascot = '/brand/postavy/kaja-user.png';
const ROLE_LABELS: Record<string, string> = {
  recepce: 'Recepce',
  pokojsk�: 'Pokojsk�',
  �dr�ba: '�dr�ba',
  sn�dan�: 'Sn�dan�',
  sklad: 'Sklad',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function PortalLoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [roleOptions, setRoleOptions] = React.useState<string[] | null>(null);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setError('Neplatné přihlašovací údaje.');
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
      setError('Vyplňte email.');
      return;
    }
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal }),
    });
    if (response.status === 403) {
      setInfo('Pokud je účet odemčený, byl odeslán odkaz pro obnovu.');
      return;
    }
    setInfo('Pokud účet existuje, byl odeslán odkaz pro obnovu.');
  }

  async function selectRole(role: string): Promise<void> {
    const csrfToken = document.cookie
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
      setError('Výběr role selhal.');
      return;
    }
    navigate('/');
  }

  return (
    <main className="k-login-page" data-testid="portal-login-page">
      <section className="k-login-card" aria-labelledby="portal-login-title">
        <p className="k-login-eyebrow">KájovoHotel · Portál</p>
        <h1 id="portal-login-title">Přihlášení uživatele</h1>
        <p className="k-login-copy">Přihlaste se pracovním účtem. Uživatelské jméno je vždy emailová adresa.</p>
        <form className="k-login-form" onSubmit={(event) => void login(event)}>
          <label className="k-login-label" htmlFor="portal-email">Email</label>
          <input id="portal-email" className="k-input" type="email" placeholder="uzivatel@kajovohotel.cz" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="k-login-label" htmlFor="portal-password">Heslo</label>
          <input id="portal-password" className="k-input" type="password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="k-button" type="submit">Přihlásit se</button>
          <button className="k-button secondary" type="button" onClick={() => void sendForgotPassword()} disabled={!email.trim()}>Zapomenuté heslo</button>
          {error ? <p className="k-login-copy" role="alert">{error}</p> : null}
          {info ? <p className="k-login-copy">{info}</p> : null}
          {roleOptions ? (
            <div className="k-toolbar">
              {roleOptions.map((role) => (
                <button key={role} className="k-button secondary" type="button" onClick={() => void selectRole(role)}>
                  Pokra�ovat jako {roleLabel(role)}
                </button>
              ))}
            </div>
          ) : null}
        </form>
      </section>
      <aside className="k-login-preview" aria-label="Ilustrace Kája">
        <img src={portalMascot} alt="Ilustrace Kája pro uživatelský login" loading="lazy" />
      </aside>
      <KajovoSign />
    </main>
  );
}


