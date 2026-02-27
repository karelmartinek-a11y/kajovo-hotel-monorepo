# ORF-08 Prompt 13 – CI smoke stabilizace

## A) Cíl
Stabilizovat E2E smoke v CI tak, aby deterministicky pokrýval auth scénáře: admin login (fixed admin), hint email flow (mock transport), user create + portal login.

## B) Exit criteria
- CI workflow obsahuje dedikovaný smoke běh s:
  - instalací Playwright browseru,
  - orchestrace API služby,
  - timeout budgetem,
  - 3 po sobě jdoucími smoke běhy.
- Smoke test explicitně ověřuje povinné scénáře 1–3.

## C) Změny
- Přidán nový smoke Playwright config s API webServer orchestration a timeout budget.
- Přidán nový smoke test scénář pro auth flow.
- Přidán DB bootstrap skript pro deterministický start API smoke instance.
- Přidány CI joby `e2e-smoke` v `ci-gates` i `ci-full`, včetně 3x opakování smoke běhu.
- Přidány npm/pnpm script entrypointy pro smoke běh.
- Přidány flake poznámky.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- PASS: `pnpm ci:e2e-smoke`
- PASS: `pnpm ci:e2e-smoke`
- PASS: `pnpm ci:e2e-smoke`

## E) Rizika/known limits
- Lokální verifikace je API-level smoke přes Playwright request client; UI rendering smoke zůstává odděleně v existujících web testech.
- CI determinismus stále závisí na dostupnosti GitHub runner dependencies pro Playwright browser install.

## F) Handoff pro další prompt
- Pokud bude potřeba rozšířit smoke do UI-level (browser page flow), navázat na tento stabilní API smoke job a přidat oddělený `ui-smoke` bez míchání do auth smoke.
- Sledovat flake trend v CI a případně přidat retry policy pouze na install krok, ne na samotný smoke test.
