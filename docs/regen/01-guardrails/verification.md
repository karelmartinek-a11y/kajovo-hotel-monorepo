# Krok 01 – Repo guardrails a sentinely

## Cíl
- Zavést CI sentinely proti regresím: zákaz `/device/*` endpointů, zákaz výskytu `Entity ID` v novém kódu (mimo `legacy/**`), zákaz sdílení page/view komponent mezi Admin a Portal.
- Udržet výjimky pro branding (`brand/**`) přes existující `ci:brand-assets` lint.
- Rozdělit CI na samostatné joby `lint`, `typecheck`, `unit-tests` a přidat gate na přítomnost `docs/regen/<NN>-<slug>/verification.md` v PR.

## Jak ověřeno
1. `pnpm ci:policy`
   - Výsledek: `Policy sentinel passed.`
2. `GITHUB_BASE_REF=main pnpm ci:verification-doc`
   - Výsledek: gate prošla; v lokálu použit fallback diff (bez `origin`).
3. `pnpm ci:brand-assets`
   - Výsledek: `Brand asset lint passed.` (whitelist výjimek pro `brand/**` zůstává přes tento gate).
4. `pnpm typecheck`
   - Výsledek: TypeScript kontrola (`tsc --noEmit`) prošla.
5. `python3 -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
   - Výsledek: `All checks passed!`
6. `pnpm unit`
   - Výsledek: **lokálně neprošlo** kvůli Python 3.10 (`StrEnum` import), CI workflow je pinované na Python 3.11.

## Co se změnilo
- Přidán sentinel `apps/kajovo-hotel/ci/policy-sentinel.mjs`.
- Přidán PR gate `apps/kajovo-hotel/ci/check-pr-verification-doc.mjs`.
- Aktualizovaný root `package.json` o skripty `ci:policy`, `ci:verification-doc`, `typecheck`, `unit`.
- Přepsán workflow `.github/workflows/ci-gates.yml`:
  - nový job `guardrails` + explicitní verification gate,
  - samostatné joby `lint`, `typecheck`, `unit-tests`.

## Rizika / known limits
- `ci:verification-doc` v PR režimu spoléhá na `origin/<base>`; fallback je určený hlavně pro lokální běh.
- Pravidlo oddělení Admin/Portal hlídá importy page/view cest (`*/pages/*`, `*/views/*`); sdílení primitives/tokenů je povoleno.
- Pattern pro `Entity ID` je cílený na textový token `Entity ID`/`EntityID`, ne na obecné identifikátory doménových entit.


---

## Oprava chyb po review (follow-up)

### Cíl
- Opravit regresi z předchozí verze guardrails: verification gate se nesmí vynucovat mimo PR.
- Zpřesnit policy sentinel tak, aby vynucoval pravidla nad změněným kódem (PR diff), ne nad celým historickým repozitářem.

### Jak ověřeno
1. `pnpm ci:verification-doc`
   - Očekávání mimo PR: skript se korektně přeskočí (`pull_request-only`).
2. `GITHUB_BASE_REF=main pnpm ci:policy`
   - Očekávání: sentinel běží proti PR diff/fallback diff a vrací `Policy sentinel passed.`

### Co se změnilo
- `check-pr-verification-doc.mjs` nyní failuje pouze v PR kontextu (`GITHUB_BASE_REF`), mimo PR se přeskočí.
- `policy-sentinel.mjs` nyní:
  - skenuje jen změněné soubory (PR diff nebo lokální fallback),
  - explicitně ignoruje `legacy/**`,
  - vynucuje `Entity ID` zákaz i pro varianty `entity_id`/`entityId`,
  - kontroluje cross-importy Admin/Portal pouze přes import statements.

### Rizika / known limits
- Pro PR diff je stále potřeba dostupný `origin/<base>`; při selhání se používá fallback lokálního diffu.


---

## Oprava CI failu po merge (follow-up 2)

### Cíl
- Opravit pád `guardrails` jobu v CI: `pnpm contract:check` musí mít v jobu připravené Python dependency.

### Jak ověřeno
1. `pnpm ci:policy`
   - Očekávání: sentinel projde.
2. `pnpm ci:verification-doc`
   - Očekávání: mimo PR korektní skip.
3. `pnpm typecheck`
   - Očekávání: TS typecheck projde.

### Co se změnilo
- `.github/workflows/ci-gates.yml` (`guardrails` job):
  - přidán `actions/setup-python@v5` s Python 3.11,
  - přidána instalace minimálních API Python balíčků před `pnpm contract:check`.

### Rizika / known limits
- Lokálně nelze plně emulovat GitHub runner kontext včetně `origin/<base>` dostupnosti; finální validace probíhá v CI.


---

## Oprava CI failu (follow-up 3)

### Cíl
- Opravit pády CI v `ci-gates.yml`: chybějící instalace Playwright browseru v `guardrails` jobu a chybějící Node/pnpm setup v `unit-tests` jobu.

### Jak ověřeno
1. `pnpm ci:policy`
2. `pnpm ci:verification-doc`
3. `pnpm typecheck`

### Co se změnilo
- `.github/workflows/ci-gates.yml`:
  - `guardrails`: přidán krok `playwright install --with-deps chromium` před e2e smoke gates.
  - `unit-tests`: doplněn `setup-node`, `setup-pnpm` a `pnpm install` před `pnpm unit`.

### Rizika / known limits
- Lokální prostředí neodpovídá plně GH runneru; finální validace závisí na běhu CI v PR.
