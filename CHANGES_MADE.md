# CHANGES_MADE

| Audit ID | Oblast / soubory | Změna | Důvod |
|---|---|---|---|
| Android legacy removal | `AGENTS.md`, odstraněné legacy Android artefakty a runtime stopy | Android už není release gate, parity blocker ani aktivní runtime povinnost. | Vlastník rozhodl, že stará Android aplikace je vyřazená. |
| K05 | `packages/ui/src/shell/AppShell.tsx`, odstraněný `packages/ui/src/shell/KajovoSign.tsx` | Z pracovního shellu zmizela vertikální signace, která kolidovala s formuláři. | Branding nesmí překrývat obsah ani CTA. |
| N02 | `apps/kajovo-hotel-web/index.html`, `apps/kajovo-hotel-admin/index.html`, `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`, `apps/kajovo-hotel-admin/src/main.tsx`, `packages/shared/src/i18n/auth.ts` | Aktivní runtime texty byly sjednoceny na `Kájovo Hotel`. | Odstranění `KájovoHotel` bez mezery v titulcích a UI. |
| K02 / S06 | `infra/ops/deploy-production.sh` | Deploy self-heal nyní doplňuje i `inventory_movements.quantity_pieces`. | Produkční detail skladu padal na DB driftu. |
| Validace runnerů | `apps/kajovo-hotel-admin/playwright.smoke.config.ts`, `apps/kajovo-hotel-web/playwright.config.ts` | Playwright webServer start používá explicitní `pnpm@9.15.0` binárku a čistší env. | Stabilní lokální smoke/visual validace po zip převodu. |
| Forenzní důkazy | `AUDIT_VERIFICATION_REPORT.md`, `AUDIT_VERIFICATION_SUMMARY.md`, `AUDIT_VERIFICATION_EVIDENCE.md`, `audit-evidence/live-admin-login-20260628.json`, `audit-evidence/live-admin-users-smoke-20260628.json`, `audit-evidence/live-admin-settings-20260628.json`, `audit-evidence/live-breakfast-refresh-20260628.json`, nové logy v `audit-evidence/command-logs/` | Auditní výstupy byly aktualizovány na finální stav repo + live runtime. | Dnešní stav musí být doložený konkrétními příkazy a výstupy. |
