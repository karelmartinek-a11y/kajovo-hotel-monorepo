import React from 'react';
import '../tokens.css';
import { KajovoFullLockup } from './KajovoFullLockup';

type KajovoStartupSplashProps = {
  eyebrow?: string;
  title: string;
  description: string;
  href?: string;
};

export function KajovoStartupSplash({
  eyebrow = 'KájovoHotel',
  title,
  description,
  href = '/',
}: KajovoStartupSplashProps): JSX.Element {
  return (
    <main className="k-startup-splash" data-testid="startup-splash">
      <section className="k-startup-splash__card" aria-labelledby="startup-splash-title">
        <KajovoFullLockup href={href} />
        <p className="k-startup-splash__eyebrow">{eyebrow}</p>
        <h1 id="startup-splash-title" className="k-startup-splash__title">{title}</h1>
        <p className="k-startup-splash__description">{description}</p>
      </section>
    </main>
  );
}
