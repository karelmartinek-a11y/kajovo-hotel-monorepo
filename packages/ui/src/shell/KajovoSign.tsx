import React from 'react';
import '../tokens.css';

export function KajovoSign(): JSX.Element {
  const labelText = 'KÁJOVO';

  return (
    <a
      className="kajovo-sign"
      data-testid="kajovo-sign"
      data-brand-element="true"
      href="/"
      aria-label={labelText}
      title={labelText}
    >
      <img src="/brand/signace/signace.svg" alt="Signace Kájovo" />
    </a>
  );
}
