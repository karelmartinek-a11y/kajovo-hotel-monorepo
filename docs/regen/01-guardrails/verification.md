# A) Cíl
- Zavést guardrails pro regresní zákazy: `/device/*`, `Entity ID` tokeny a sdílení page/view komponent mezi Portal a Admin (primitives/tokens/shared types zůstávají povolené).
- Zajistit CI gate pro povinný `docs/regen/<NN>-<slug>/verification.md` v PR.
- Potvrdit whitelist výjimek pro `brand/**` při kontrolách hardcoded hodnot.

# B) Exit criteria
- CI failne při porušení uvedených policy pravidel.
- CI failne v PR bez `docs/regen/<NN>-<slug>/verification.md`.
- CI obsahuje samostatné joby `lint`, `typecheck`, `unit-tests`.
- Whitelist pro `brand/**` je explicitně zdokumentovaný/implementovaný.

# C) Změny
- Rozšířen `policy-sentinel` o robustnější detekci zakázaných importů page/view mezi Admin a Portal i při cross-app importech (`apps/kajovo-hotel-admin` ↔ `apps/kajovo-hotel-web`).
- Zachován zákaz `/device/*` a `Entity ID` v novém kódu (mimo `legacy/**`) nad změněnými soubory PR diffu.
- `lint-tokens` rozšířen o kontrolu Admin app zdrojů a explicitní whitelist prefixu `brand/` pro hardcoded-color pravidla.
- `ci-gates.yml` už obsahuje požadované joby a verification-doc gate; ověřeno v tomto kroku jako aktivní guardrail cesta.

# D) Ověření
- PASS: `pnpm ci:policy`
- PASS: `GITHUB_BASE_REF=main pnpm ci:verification-doc`
- PASS: `pnpm ci:brand-assets`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`

# E) Rizika/known limits
- `ci:verification-doc` je navržený primárně pro `pull_request` kontext; lokální běh simuluje PR přes `GITHUB_BASE_REF`.
- Policy sentinel je textový scanner změněných souborů; negarantuje semantickou analýzu AST.

# F) Handoff pro další prompt
- Pokud vzniknou nové app/workspace cesty s Portal/Admin page/view strukturou, doplnit je do sentinel regex/prefix pravidel.
- Při rozšiřování token-hardeningu držet whitelist výjimek omezený jen na `brand/**` a dokumentovat nové výjimky explicitně.
