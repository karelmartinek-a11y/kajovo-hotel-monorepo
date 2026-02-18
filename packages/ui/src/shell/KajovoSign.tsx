import React from "react";
import "../tokens.css";

/**
 * Kajovo SIGNACE.
 * Manifest requirements are enforced via token CSS variables.
 */
export function KajovoSign(): JSX.Element {
  return (
    <div data-testid="kajovo-sign" className="kajovo-sign" aria-label="KÁJOVO">
      KÁJOVO
    </div>
  );
}
