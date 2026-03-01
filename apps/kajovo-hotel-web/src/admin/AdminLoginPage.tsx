import React from 'react';

const adminMascot = '/brand/postavy/kaja-admin.png';

export function AdminLoginPage(): JSX.Element {
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
      setError('Vyplňte email i heslo.');
      return;
    }
    const response = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: principal, password }),
    });
    if (!response.ok) {
      setError('Neplatné přihlašovací údaje.');
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
      setHintStatus('Pokud účet existuje, byl odeslán odkaz pro odblokování.');
      return;
    }
    setHintStatus('Pokud účet existuje, byl odeslán odkaz pro odblokování.');
  }

  return (
    <main className="k-login-page" data-testid="admin-login-page">
      <section className="k-login-card" aria-labelledby="admin-login-title">
        <p className="k-login-eyebrow">KájovoHotel · Admin</p>
        <h1 id="admin-login-title">Přihlášení administrace</h1>
        <p className="k-login-copy">Použijte pevný admin účet pro správu uživatelů a nastavení provozu.</p>
        <form className="k-login-form" onSubmit={(event) => void login(event)}>
          <label className="k-login-label" htmlFor="admin-email">Email</label>
          <input id="admin-email" className="k-input" type="text" inputMode="email" autoComplete="username" placeholder="provoz@hotelchodovasc.cz" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="k-login-label" htmlFor="admin-password">Heslo</label>
          <input id="admin-password" className="k-input" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="k-button" type="submit">Přihlásit se</button>
          <button className="k-button secondary" type="button" onClick={() => void sendPasswordHint()} disabled={!email.trim()}>Zapomenuté heslo</button>
          {error ? <p className="k-login-copy" role="alert">{error}</p> : null}
          {hintStatus ? <p className="k-login-copy">{hintStatus}</p> : null}
        </form>
      </section>
      <aside className="k-login-preview" aria-label="Ilustrace Kája">
        <img src={adminMascot} alt="Ilustrace Kája pro admin login" loading="lazy" />
      </aside>
    </main>
  );
}
