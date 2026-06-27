import React from 'react';
import { Link } from 'react-router-dom';

export function AdminHomePage(): JSX.Element {
  return (
    <main className="k-page" data-testid="admin-home-page">
      <h1>Administrace Kájovo Hotel</h1>
      <p>Administrace Kájovo Hotel je oddělena od uživatelského portálu.</p>
      <div className="k-toolbar">
        <Link className="k-button" to="/admin/login">Přihlášení administrace</Link>
        <Link className="k-button secondary" to="/login">Přihlášení portálu</Link>
      </div>
    </main>
  );
}
