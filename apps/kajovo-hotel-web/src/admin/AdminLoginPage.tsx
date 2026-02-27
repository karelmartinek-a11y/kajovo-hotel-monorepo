import React from 'react';

const adminLoginPreview = new URL('../../../../brand/panel/login_admin.png', import.meta.url).href;

export function AdminLoginPage(): JSX.Element {
  return (
    <main className="k-login-page" data-testid="admin-login-page">
      <section className="k-login-card" aria-labelledby="admin-login-title">
        <p className="k-login-eyebrow">KájovoHotel · Admin</p>
        <h1 id="admin-login-title">Přihlášení administrace</h1>
        <p className="k-login-copy">Použijte pevný admin účet pro správu uživatelů a nastavení provozu.</p>
        <form className="k-login-form" onSubmit={(event) => event.preventDefault()}>
          <label className="k-login-label" htmlFor="admin-email">Email</label>
          <input id="admin-email" className="k-input" type="email" placeholder="admin@kajovohotel.cz" defaultValue="admin@kajovohotel.cz" />
          <label className="k-login-label" htmlFor="admin-password">Heslo</label>
          <input id="admin-password" className="k-input" type="password" placeholder="••••••••" defaultValue="admin-fixed-password" />
          <button className="k-button" type="submit">Přihlásit se</button>
        </form>
      </section>
      <aside className="k-login-preview" aria-label="Náhled admin panelu">
        <img src={adminLoginPreview} alt="Návrh přihlášení administrace" loading="lazy" />
      </aside>
    </main>
  );
}
