# ORF-00 Normalization Verification

## A) Cíl

Normalizovat stav promptů 00–15 do jednoho SSOT trackeru, namapovat existující evidence adresáře (včetně `*-fix`, `04-auth-foundation`, `05-admin-users`) na prompt sloty a zapsat parity stav pro modul `delivery_tracker` jako DONE.

## B) Exit criteria

- Existuje `docs/regen/progress.md` se sloty 00–15 a sloupci: Prompt, Status, Evidence dir, PR/commit, Blockers, Next owner action.
- Tracker obsahuje explicitní mapování mimo-plán evidencí (`*-fix`, `04-auth-foundation`, `05-admin-users`).
- `docs/regen/parity/parity-map.yaml` obsahuje modul `delivery_tracker` se stavem DONE a odkazem na tracker.
- Je vytvořen tento verifikační soubor pro ORF-00.

## C) Změny

- Přidán SSOT tracker `docs/regen/progress.md` pro prompt sloty 00–15.
- Přidáno mapování evidenčních adresářů na sloty 01, 02, 04, 05 (core + fix split).
- Aktualizována parity mapa o modul `delivery_tracker` = DONE.
- Přidán tento verifikační dokument.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `find docs/regen -maxdepth 2 -type d | sort`
- PASS: `find docs/regen -maxdepth 2 -type f | sort`
- PASS: `for d in docs/regen/00-forensics docs/regen/01-guardrails docs/regen/01-packaging-fix docs/regen/02-design-foundation docs/regen/02-webtests-fix docs/regen/03-visual-states-fix docs/regen/04-auth-foundation docs/regen/04-webtest-exit1-fix docs/regen/05-admin-users docs/regen/05-webtest-command-fix docs/regen/06-playwright-tablet-browser-fix; do git log -1 --pretty=format:'%h %s' -- "$d"; echo; done`
- PASS: `python -c "import yaml; yaml.safe_load(open('docs/regen/parity/parity-map.yaml')); print('OK')"`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (known existing blocker): `pnpm unit` (pytest fixture `api_base_url` failed with `RuntimeError: API did not start in time` for all API tests)

## E) Rizika / known limits

- Tracker je dokumentační normalizace; neprovádí automatické enforcement pravidel na CI.
- Historické commity byly přemapovány podle dostupné evidence v repo; bez externího PR indexu mohou některé PR URL chybět.
- `pnpm unit` v aktuálním prostředí neprošlo kvůli startu testovacího API procesu (`uvicorn`) v existující test fixture.

## F) Handoff pro další prompt

- Při realizaci ORF-07+ používat tento tracker jako jediný číselný referenční index.
- Každý nový prompt má mít vlastní adresář `docs/regen/<NN>-<slug>/verification.md` a řádek aktualizovaný v `docs/regen/progress.md`.
- Pro fix selhání unit gate otevřít fix-only prompt zaměřený na stabilizaci API test bootstrapu.
