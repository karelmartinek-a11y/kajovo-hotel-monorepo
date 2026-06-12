import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon, KajovoFullLockup, KajovoSign } from '@kajovo/ui';
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
    document.title = 'KájovoHotel · Dokončení resetu hesla';
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
        <KajovoFullLockup href="/" title="KájovoHotel" subtitle="Obnova přístupu" />
        <p className="k-login-eyebrow">{bundle.copy.eyebrow}</p>
        <h1 id="portal-reset-title">Dokončení resetu hesla</h1>
        <p className="k-login-copy">
          Dokončete reset hesla z odkazu, který vystavil administrátor. Po uložení se přihlásíte novým heslem.
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
            Potvrzení hesla
          </label>
          <input
            id="portal-reset-password-confirm"
            className="k-input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <button className="k-button" type="submit" disabled={busy}>
            Nastavit nové heslo
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
      <aside className="k-login-preview" aria-label="Instrukce k obnoveni pristupu">
        <div className="k-card">
          <div className="k-card__header">
            <div className="k-card__title-wrap">
              <p className="k-card__eyebrow">Obnova pristupu</p>
              <h3>Po zmene hesla se vratite zpet do smeny</h3>
            </div>
            <Icon name="profile" className="k-card__icon" title="Obnova pristupu" />
          </div>
          <div className="k-card__body k-grid">
            <p className="k-text-muted">Pouzijte odkaz ze spravcovskeho mailu a nastavte nove heslo alespon o 8 znacich.</p>
            <div className="k-nav-link"><Icon name="file-text" className="k-nav-link__icon" /><span>Token z odkazu</span></div>
            <div className="k-nav-link"><Icon name="tool" className="k-nav-link__icon" /><span>Nova hesla musi souhlasit</span></div>
          </div>
        </div>
      </aside>
      <KajovoSign href="/" />
    </main>
  );
}
