# Krok 03 – Skutečný admin/portal split

## A) Cíl
- Dokončit separaci aplikací na `apps/kajovo-hotel-web` (Portal), `apps/kajovo-hotel-admin` (Admin) a `apps/kajovo-hotel-api` (API).
- Zajistit oddělené login entrypointy pro admin a portal.
- Rozšířit policy sentinel o zákaz sdílení page/view mezi portal/admin i na úrovni separátních app.

## B) Exit criteria
1. Web a Admin běží jako samostatné app workspace.
2. Každá app má vlastní login route (`/login`) a vlastní auth endpoint.
3. Sentinel failne při cross-app page/view importu.
4. Lint + typecheck + unit + policy check proběhnou.

## C) Změny
- Založena samostatná app `apps/kajovo-hotel-admin` (fork z web app) s vlastní identitou balíčku.
- Portal (`apps/kajovo-hotel-web`) doplněn o dedikovanou login stránku a guard na `actorType === 'portal'`.
- Admin (`apps/kajovo-hotel-admin`) doplněn o dedikovanou login stránku a guard na `actorType === 'admin'`.
- Rozšířen sentinel `apps/kajovo-hotel/ci/policy-sentinel.mjs` o cross-app zákaz importů `pages/views` mezi admin a portal app.
- Aktualizována dokumentace app mapy (`app-map.md`) a parity stav.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm --filter @kajovo/kajovo-hotel-web lint`
- PASS: `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- PASS: `pnpm ci:policy`

## E) Rizika/known limits
- Admin app je v tomto kroku technický split s převzatými route moduly; hlubší IA/feature pruning pro admin-only scope je navazující práce.
- E2E test matrix zatím běží primárně nad portal app; admin specifické E2E lze rozšířit v dalším promptu.

## F) Handoff pro další prompt
- Rozdělit testovací scénáře tak, aby CI cíleně verifikovalo i admin app smoke/login flow.
- Dovyčistit admin navigaci/moduly podle finální IA pro admin-only povinné use-cases.
