# Testing

## Local commands

1. **Install deps**  
   `pnpm install` afterwards `pnpm --filter` commands reuse the shared workspace.

2. **TypeScript lint**  
   `pnpm lint`

3. **Backend unit tests**  
   `pnpm unit` – spouští `python -m pytest apps/kajovo-hotel-api/tests`.

4. **Frontend builds & smoke**  
   - `pnpm --filter @kajovo/kajovo-hotel-web build`  
   - `pnpm --filter @kajovo/kajovo-hotel-admin build`  
   - `pnpm --filter @kajovo/kajovo-hotel-web test:smoke` (nový Playwright soubor `tests/smoke.spec.ts` kryje:  
     * přihlášení administrátora,  
     * navigaci do adminu a přístup k modulům,  
     * výpis / vytvoření / smazání uživatele,  
     * zobrazení chybové hlášky v případě chybějících oprávnění,  
     * základní protection scénáře).

5. **Full Playwright gates (volitelné)**  
   - `pnpm --filter @kajovo/kajovo-hotel-web test`  
   - `pnpm --filter @kajovo/kajovo-hotel-admin test`  
   Tyto běhy jsou součástí existujících CI gate kanálů, ale pro rychlé smoke stačí `test:smoke`.

## GitHub Actions

- `CI Core - Kájovo Hotel` spouští:
  * install (pnpm + Python),
  * lint,
  * unit testy (`pnpm unit`),
  * buildy (`web` + `admin`),
  * nový smoke Playwright (`apps/kajovo-hotel-web/tests/smoke.spec.ts`).

- `CI Release - Kájovo Hotel` opakuje výše (push do `main`) a po úspěchu spouští `Deploy - hotel.hcasc.cz`.

- `Preview Build - Kájovo Hotel` generuje archivované buildy pro ruční staging (zatím bez automatického deploye, protože není dostupný cílový host a tajné proměnné).

## Fail-fast a cache

- workflowy používají cache pro `~/.pnpm-store` a `~/.cache/pip`, aby opakovaná instalace byla rychlejší.  
- Joby se nespouštějí paralelně díky `concurrency` (release, preview).  
- Fail-fast logika se stará o rychlý návrat při selhání lint/test kroků.
