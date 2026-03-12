import React from 'react';
import '../tokens.css';

type KajovoSignProps = {
  href?: string;
};

export function KajovoSign({ href = '/' }: KajovoSignProps): JSX.Element {
  const labelText = 'KÁJOVO';

  return (
    <a
      className="kajovo-sign"
      data-testid="kajovo-sign"
      data-brand-element="true"
      href={href}
      aria-label={labelText}
      title={labelText}
    >
      <img src="/brand/signace/signace.svg" alt="Signace Kájovo" />
    </a>
  );
}
