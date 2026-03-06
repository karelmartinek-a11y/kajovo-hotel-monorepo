import React from 'react';
import '../tokens.css';

type KajovoWordmarkProps = {
  href?: string;
  variant?: 'portal' | 'admin';
  title?: string;
};

export function KajovoWordmark({
  href = '/',
  variant = 'portal',
  title,
}: KajovoWordmarkProps): JSX.Element {
  const config =
    variant === 'admin'
      ? {
          label: 'Administrace',
          defaultTitle: 'KájovoHotel Administrace',
          alt: 'Wordmark KájovoHotel Administrace',
        }
      : {
          label: 'Portál',
          defaultTitle: 'KájovoHotel Portál',
          alt: 'Wordmark KájovoHotel Portál',
        };
  const resolvedTitle = title ?? config.defaultTitle;

  return (
    <a
      className="k-wordmark"
      href={href}
      data-brand-element="true"
      aria-label={resolvedTitle}
      title={resolvedTitle}
    >
      <img
        src="/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg"
        alt={config.alt}
        loading="lazy"
      />
      <span className="k-wordmark-tagline">{config.label}</span>
    </a>
  );
}
