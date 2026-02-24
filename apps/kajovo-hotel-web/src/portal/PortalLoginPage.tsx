import React from 'react';

const portalLoginPreview = new URL('../../../../brand/panel/login_user_fail.png', import.meta.url).href;

export function PortalLoginPage(): JSX.Element {
  return (
    <main className="k-login-page" data-testid="portal-login-page">
      <section className="k-login-card" aria-labelledby="portal-login-title">
        <p className="k-login-eyebrow">KájovoHotel · Portál</p>
        <h1 id="portal-login-title">Přihlášení uživatele</h1>
        <p className="k-login-copy">Přihlaste se pracovním účtem. Uživatelské jméno je vždy emailová adresa.</p>
        <form className="k-login-form" onSubmit={(event) => event.preventDefault()}>
          <label className="k-login-label" htmlFor="portal-email">Email</label>
          <input id="portal-email" className="k-input" type="email" placeholder="uzivatel@kajovohotel.cz" />
          <label className="k-login-label" htmlFor="portal-password">Heslo</label>
          <input id="portal-password" className="k-input" type="password" placeholder="••••••••" />
          <button className="k-button" type="submit">Přihlásit se</button>
        </form>
      </section>
      <aside className="k-login-preview" aria-label="Náhled uživatelského přihlášení">
        <img src={portalLoginPreview} alt="Návrh uživatelského přihlášení v chybovém stavu" loading="lazy" />
      </aside>
    </main>
  );
}
