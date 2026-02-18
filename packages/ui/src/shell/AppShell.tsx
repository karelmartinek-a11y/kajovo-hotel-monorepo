import React from "react";
import "../tokens.css";
import { KajovoSign } from "./KajovoSign";

type AppShellProps = {
  children: React.ReactNode;
  /** Set true only when rendering a PopUp that should not show the floating SIGNACE. */
  isPopup?: boolean;
};

export function AppShell(props: AppShellProps): JSX.Element {
  return (
    <div className="app-shell">
      {!props.isPopup ? <KajovoSign /> : null}
      {props.children}
    </div>
  );
}
