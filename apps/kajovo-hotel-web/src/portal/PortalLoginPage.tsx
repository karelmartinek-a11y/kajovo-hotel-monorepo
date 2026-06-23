import React from 'react';
import { Icon, KajovoFullLockup, KajovoSign } from '@kajovo/ui';
import { getAuthBundle } from '@kajovo/shared';

type PortalLoginPageProps = {
  initialError?: string | null;
};

type AndroidReleaseInfo = {
  version_code: number;
  version: string;
  download_url: string;
  sha256: string;
  title: string;
  message: string;
  required: boolean;
};

type AndroidInstallState = 'hidden' | 'probing' | 'installed' | 'missing';

const ANDROID_APP_PACKAGE = 'cz.hcasc.kajovohotel.app';
const ANDROID_APK_PATH = '/downloads/kajovo-hotel-android.apk';
const ANDROID_APP_INTENT = `intent://open/login#Intent;scheme=kajovohotel;package=${ANDROID_APP_PACKAGE};end`;

function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /Android/i.test(navigator.userAgent);
}

function normalizeDownloadHref(downloadUrl?: string | null): string {
  if (!downloadUrl) {
    return ANDROID_APK_PATH;
  }
  try {
    const parsed = new URL(downloadUrl, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return ANDROID_APK_PATH;
  }
  return downloadUrl;
}

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
  const [androidRelease, setAndroidRelease] = React.useState<AndroidReleaseInfo | null>(null);
  const [androidInstallState, setAndroidInstallState] = React.useState<AndroidInstallState>('hidden');

  React.useEffect(() => {
    setError(initialError);
  }, [initialError]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let cancelled = false;
    void fetch('/api/app/android-release', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return await response.json() as AndroidReleaseInfo;
      })
      .then((payload) => {
        if (!cancelled && payload) {
          setAndroidRelease(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAndroidRelease(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    if (!isAndroidBrowser()) {
      setAndroidInstallState('hidden');
      return;
    }

    let finished = false;
    let timeoutId: number | undefined;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    setAndroidInstallState('probing');

    const markInstalled = () => {
      if (finished) {
        return;
      }
      finished = true;
      setAndroidInstallState('installed');
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      iframe.remove();
    };

    const markMissing = () => {
      if (finished) {
        return;
      }
      finished = true;
      setAndroidInstallState('missing');
      iframe.remove();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markInstalled();
      }
    };

    document.body.appendChild(iframe);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', markInstalled);

    timeoutId = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') {
        markInstalled();
        return;
      }
      markMissing();
    }, 1400);

    try {
      iframe.contentWindow?.location.replace(ANDROID_APP_INTENT);
    } catch {
      markMissing();
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', markInstalled);
      iframe.remove();
    };
  }, []);

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

  const releaseVersionLabel = androidRelease?.version?.trim() || '2.0 NG';
  const downloadHref = androidRelease ? normalizeDownloadHref(androidRelease.download_url) : ANDROID_APK_PATH;
  const showAndroidSmartCard = isAndroidBrowser();
  const showInstallPrompt = showAndroidSmartCard && androidInstallState === 'missing';
  const showOpenPrompt = showAndroidSmartCard && androidInstallState === 'installed';
  const showProbePrompt = showAndroidSmartCard && androidInstallState === 'probing';

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
        <section
          className={`k-login-download${showAndroidSmartCard ? ' k-login-download--android-device' : ''}`}
          aria-labelledby="portal-download-title"
          data-testid="portal-android-download-card"
        >
          <h2 id="portal-download-title" className="k-login-download__title">
            KájovoHotel Android {releaseVersionLabel}
          </h2>
          <div className="k-login-download__preview" aria-hidden="true">
            <img src="/downloads/kajovo-hotel-android-icon.png" alt="" />
          </div>
          <p className="k-login-download__copy">
            Pro přihlášení z telefonu nebo tabletu si můžeš stáhnout plnohodnotnou nativní Android aplikaci v APK balíčku.
          </p>
          {showProbePrompt ? (
            <div className="k-login-feedback" data-testid="android-app-probing">
              <p className="k-login-feedback-title">Kontroluji, jestli už je KájovoHotel nainstalovaný.</p>
              <p className="k-login-feedback-description">Pokud se aplikace neotevře, připravím ti rovnou instalaci verze {releaseVersionLabel}.</p>
            </div>
          ) : null}
          {showOpenPrompt ? (
            <div className="k-login-feedback" data-testid="android-app-installed-hint">
              <p className="k-login-feedback-title">KájovoHotel je na zařízení dostupný.</p>
              <p className="k-login-feedback-description">Otevři nativní aplikaci a pokračuj přímo v ní. Web nechávám jen jako fallback.</p>
            </div>
          ) : null}
          {showInstallPrompt ? (
            <div className="k-login-feedback" data-testid="android-app-install-hint">
              <p className="k-login-feedback-title">Na tomhle Android zařízení ještě není KájovoHotel {releaseVersionLabel} nainstalovaný.</p>
              <p className="k-login-feedback-description">Stáhni APK, potvrď instalaci a pak se přihlaš už přímo v nativní aplikaci.</p>
            </div>
          ) : null}
          <div className="k-login-download__actions">
            {showAndroidSmartCard ? (
              <a
                className="k-button"
                href={`${ANDROID_APP_INTENT.replace(';end', `;S.browser_fallback_url=${encodeURIComponent(downloadHref)};end`)}`}
              >
                Otevřít aplikaci
              </a>
            ) : null}
            <a
              className="k-button k-login-download__action"
              href={downloadHref}
              download="kajovo-hotel-android.apk"
            >
              Stáhnout APK
            </a>
          </div>
          <p className="k-login-download__meta" data-testid="portal-android-release-version">
            Aktuální release: {releaseVersionLabel}
          </p>
        </section>
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
            <div className="k-nav-link"><Icon name="file-text" className="k-nav-link__icon" /><span>Hlášení, profil a nativní Android</span></div>
          </div>
        </div>
      </aside>
      <KajovoSign href="/" />
    </main>
  );
}
