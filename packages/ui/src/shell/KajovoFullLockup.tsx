import React from 'react';
import '../tokens.css';

type KajovoFullLockupProps = {
  href?: string;
  title?: string;
  subtitle?: string | null;
};

export function KajovoFullLockup({
  href = '/',
  title = 'KájovoHotel',
  subtitle = null,
}: KajovoFullLockupProps): JSX.Element {
  const accessibleTitle = subtitle ? `${title} - ${subtitle}` : title;

  return (
    <a
      className="k-full-lockup"
      href={href}
      data-brand-element="true"
      aria-label={accessibleTitle}
      title={accessibleTitle}
    >
      <img
        className="k-full-lockup-image"
        src="/brand/apps/kajovo-hotel/logo/exports/full/svg/kajovo-hotel_full.svg"
        alt={accessibleTitle}
        loading="eager"
      />
      {subtitle ? <span className="k-full-lockup-subtitle">{subtitle}</span> : null}
    </a>
  );
}
