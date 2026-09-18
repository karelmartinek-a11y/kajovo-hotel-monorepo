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
          defaultTitle: 'Kájovo Hotel Administrace',
        }
      : {
          label: 'Portál',
          defaultTitle: 'Kájovo Hotel Portál',
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
        className="k-wordmark-mark"
        src="/brand/apps/kajovo-hotel/logo/exports/mark/svg/kajovo-hotel_mark.svg"
        alt=""
        aria-hidden="true"
        loading="lazy"
      />
      <span className="k-wordmark-name" aria-hidden="true">
        <strong>Kájovo</strong><em>Hotel</em>
      </span>
      <span className="k-wordmark-tagline">{config.label}</span>
    </a>
  );
}
