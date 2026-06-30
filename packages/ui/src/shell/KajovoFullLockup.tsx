import React from 'react';
import '../tokens.css';

type KajovoFullLockupProps = {
  href?: string;
  title?: string;
  subtitle?: string | null;
};

export function KajovoFullLockup({
  href = '/',
  title = 'Kájovo Hotel',
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
      <span className="k-full-lockup-row">
        <img
          className="k-full-lockup-mark"
          src="/brand/apps/kajovo-hotel/logo/exports/mark/svg/kajovo-hotel_mark.svg"
          alt=""
          aria-hidden="true"
          loading="eager"
        />
        <span className="k-full-lockup-copy">
          <img
            className="k-full-lockup-wordmark"
            src="/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg"
            alt={title}
            loading="eager"
          />
          {subtitle ? <span className="k-full-lockup-subtitle">{subtitle}</span> : null}
        </span>
      </span>
    </a>
  );
}
