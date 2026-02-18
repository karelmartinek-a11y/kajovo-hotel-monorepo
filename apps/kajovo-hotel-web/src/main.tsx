import React from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@kajovo/ui";

function Dashboard() {
  return (
    <main>
      <h1>KájovoHotel</h1>
      <p>Skeleton aplikace. Refaktor bude pokračovat přes Codex.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell>
      <Dashboard />
    </AppShell>
  </React.StrictMode>
);
