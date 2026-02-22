import React from 'react';
import '../tokens.css';

export function KajovoSign(): JSX.Element {
  return (
    <a className="kajovo-sign" data-testid="kajovo-sign" data-brand-element="true" href="/" aria-label="KÁJOVO">
      <img src="/brand/signace/signace.svg" alt="KÁJOVO signace" />
    </a>
  );
}
