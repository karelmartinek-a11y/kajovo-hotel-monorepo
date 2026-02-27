import React from 'react';
import { Link } from 'react-router-dom';

export function AdminHomePage(): JSX.Element {
  return (
    <main className="k-page" data-testid="admin-home-page">
      <h1>Admin panel</h1>
      <p>Administrace KájovoHotel je oddělena od uživatelského portálu.</p>
      <div className="k-toolbar">
        <Link className="k-button" to="/admin/login">Admin login</Link>
        <Link className="k-button secondary" to="/login">Portal login</Link>
      </div>
    </main>
  );
}
