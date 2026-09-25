import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, KajovoFullLockup } from '@kajovo/ui';
import { getAuthBundle, setPortalLocale, t, type PortalLocale } from '@kajovo/shared';
import { LocaleSwitcher } from './LocaleSwitcher';

async function readErrorMessage(response: Response): Promise<string> {
  await response.body?.cancel();
  return response.status === 400 || response.status === 404
    ? t('Resetovací odkaz je neplatný nebo vypršel.')
    : t('Reset hesla se nepodařilo dokončit.');
}

export function PortalResetPasswordPage(): JSX.Element {
  const [locale, setLocale] = React.useState<PortalLocale>(() => { setPortalLocale('cs'); return 'cs'; });
  const bundle = React.useMemo(() => getAuthBundle('portal', locale), [locale]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token')?.trim() ?? '';
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const redirectTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.lang = bundle.locale;
    document.title = t('Kájovo Hotel · Dokončení resetu hesla');
  }, [bundle.locale]);

  React.useEffect(() => () => {
    if (redirectTimeoutRef.current !== null) {
      window.clearTimeout(redirectTimeoutRef.current);
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!token) {
      setError(t('Resetovací odkaz je neplatný nebo neúplný.'));
      return;
    }
    if (password.trim().length < 8) {
      setError(t('Nové heslo musí mít alespoň 8 znaků.'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('Hesla se neshodují.'));
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
      setInfo(t('Heslo bylo změněno. Za chvíli vás přesměrujeme na přihlášení.'));
      if (redirectTimeoutRef.current !== null) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
      redirectTimeoutRef.current = window.setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (submitError) {
      setBusy(false);
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : t('Reset hesla se nepodařilo dokončit.')
      );
    }
  }

  return (
    <main className="k-login-page" data-testid="portal-reset-password-page">
      <section className="k-login-card" aria-labelledby="portal-reset-title">
        <LocaleSwitcher locale={locale} onSelect={(value) => { setPortalLocale(value); setLocale(value); }} />
        <KajovoFullLockup href="/" title={t("Kájovo Hotel")} subtitle={t("Obnova přístupu")} />
        <p className="k-login-eyebrow">{bundle.copy.eyebrow}</p>
        <h1 id="portal-reset-title">{t("Dokončení resetu hesla")}</h1>
        <p className="k-login-copy">{t("Dokončete reset hesla z odkazu, který vystavil administrátor. Po uložení vás přesměrujeme na přihlášení do hotelového portálu.")}{' '}</p>
        <form className="k-login-form" onSubmit={(event) => void submit(event)}>
          <label className="k-login-label" htmlFor="portal-reset-password">{t("Nové heslo")}{' '}</label>
          <input
            id="portal-reset-password"
            className="k-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label className="k-login-label" htmlFor="portal-reset-password-confirm">{t("Potvrzení hesla")}{' '}</label>
          <input
            id="portal-reset-password-confirm"
            className="k-input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <button className="k-button" type="submit" disabled={busy}>{t("Nastavit nové heslo")}{' '}</button>
          <Link className="k-button secondary" to="/login">{t("Zpět na přihlášení")}{' '}</Link>
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
      <aside className="k-login-preview" aria-label={t("Instrukce k obnoveni pristupu")}>
        <div className="k-card">
          <div className="k-card__header">
            <div className="k-card__title-wrap">
              <p className="k-card__eyebrow">{t("Obnova pristupu")}</p>
              <h3>{t("Po zmene hesla se vratite zpet do smeny")}</h3>
            </div>
            <Icon name="profile" className="k-card__icon" title={t("Obnova pristupu")} />
          </div>
          <div className="k-card__body k-grid">
            <p className="k-text-muted">{t("Použijte odkaz ze správcovského e-mailu a nastavte nové heslo alespoň o 8 znacích.")}</p>
            <div className="k-nav-link"><Icon name="file-text" className="k-nav-link__icon" /><span>{t("Token z odkazu")}</span></div>
            <div className="k-nav-link"><Icon name="tool" className="k-nav-link__icon" /><span>{t("Nova hesla musi souhlasit")}</span></div>
          </div>
        </div>
      </aside>
    </main>
  );
}
