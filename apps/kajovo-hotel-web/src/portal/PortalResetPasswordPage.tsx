import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KajovoSign } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text();
  if (!raw) {
    return 'Reset hesla se nepodařilo dokončit.';
  }
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    // Vracíme níže původní text odpovědi.
  }
  return raw.trim() || 'Reset hesla se nepodařilo dokončit.';
}

export function PortalResetPasswordPage(): JSX.Element {
  const bundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('portal', lang);
  }, []);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = bundle.locale;
    document.title = 'KájovoHotel · Reset hesla';
  }, [bundle.locale]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!token) {
      setError('Resetovací odkaz je neplatný nebo neúplný.');
      return;
    }
    if (password.trim().length < 8) {
      setError('Nové heslo musí mít alespoň 8 znaků.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Hesla se neshodují.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!response.ok) {
        setBusy(false);
        setError(await readErrorMessage(response));
        return;
      }
      setBusy(false);
      setPassword('');
      setConfirmPassword('');
      setInfo('Heslo bylo změněno. Můžete se přihlásit novým heslem.');
    } catch (submitError) {
      setBusy(false);
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : 'Reset hesla se nepodařilo dokončit.'
      );
    }
  }

  return (
    <main className="k-login-page" data-testid="portal-reset-password-page">
      <section className="k-login-card" aria-labelledby="portal-reset-title">
        <img
          className="k-login-wordmark"
          src="/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg"
          alt="KájovoHotel wordmark"
          loading="lazy"
        />
        <p className="k-login-eyebrow">{bundle.copy.eyebrow}</p>
        <h1 id="portal-reset-title">Nastavení nového hesla</h1>
        <p className="k-login-copy">
          Zadejte nové heslo pro svůj pracovní účet. Resetovací odkaz je jednorázový.
        </p>
        <form className="k-login-form" onSubmit={(event) => void submit(event)}>
          <label className="k-login-label" htmlFor="portal-reset-password">
            Nové heslo
          </label>
          <input
            id="portal-reset-password"
            className="k-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label className="k-login-label" htmlFor="portal-reset-password-confirm">
            Potvrzení nového hesla
          </label>
          <input
            id="portal-reset-password-confirm"
            className="k-input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <button className="k-button" type="submit" disabled={busy}>
            Uložit nové heslo
          </button>
          <Link className="k-button secondary" to="/login">
            Zpět na přihlášení
          </Link>
          {error ? (
            <p className="k-login-copy" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="k-login-copy" role="status">
              {info}
            </p>
          ) : null}
        </form>
      </section>
      <KajovoSign href="/" />
    </main>
  );
}
