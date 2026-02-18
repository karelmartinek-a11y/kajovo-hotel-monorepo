# Cutover plan: nový portál paralelně se starým portálem

Tento plán zavádí nový portál tak, aby běžel **paralelně** vedle legacy portálu bez zásahu do legacy routingu a bez změn UI/brand pravidel.

## 1) Cíl a principy cutoveru

- Legacy portál zůstává dostupný na původním hostu/doméně beze změn.
- Nový portál běží odděleně přes:
  - **preferovaně nový hostname** (např. `kajovohotel-staging.hcasc.cz`), nebo
  - alternativně pod **path prefixem** (`/new-portal`) na samostatné reverse proxy vrstvě.
- Traffic se převádí řízeně: interní testy -> omezený provoz -> plný provoz.
- Rollback je okamžitý přesměrováním DNS/reverse proxy zpět na legacy.

## 2) Varianta A (doporučená): nový hostname

### 2.1 Připrava prostředí

1. Nasadit nový stack dle `docs/how-to-deploy.md`.
2. Ujistit se, že běží kontejnery `web`, `api`, `postgres` a healthchecky jsou `healthy`.
3. Připravit reverse proxy vrstvu (viz `infra/reverse-proxy-example/nginx.conf`).
4. Nastavit DNS záznam:
   - `kajovohotel-staging.hcasc.cz` -> reverse proxy IP

### 2.2 Routing

- `https://kajovohotel-staging.hcasc.cz/api/*` -> nový API backend.
- `https://kajovohotel-staging.hcasc.cz/*` -> nový web frontend.
- Legacy host (např. produkční doména) se nemění.

### 2.3 Postupný cutover

1. Interní test pouze na `kajovohotel-staging.hcasc.cz`.
2. Smoke + modulové ověření (checklist níže).
3. Pilotní uživatelé (omezená skupina).
4. Rozhodnutí GO/NO-GO.
5. Po GO:
   - buď přepnout hlavní DNS na nový web,
   - nebo ponechat nový host jako primary a legacy jako fallback host.

## 3) Varianta B (alternativa): path-based routing

Pokud není možné použít nový host:

- `/new-portal/api/*` -> nový API backend.
- `/new-portal/*` -> nový web frontend.
- `/` a ostatní stávající routy zůstávají na legacy portálu.

> Poznámka: pro SPA je nutné validovat base-path konfiguraci a fallback (`index.html`) pod prefixem.

## 4) Verifikační checklist po modulech

Použijte smoke skript z `infra/smoke/smoke.sh` + manuální kontrolu níže.

### 4.1 Dashboard a utility stavy

- [ ] `GET /` vrací 200 + HTML.
- [ ] `/intro`, `/offline`, `/maintenance`, `/404` se načítají bez runtime chyb.
- [ ] Přechody mezi moduly fungují z hlavní navigace.

### 4.2 Snídaně (`/snidane`)

- [ ] Seznam (`/snidane`) načte data.
- [ ] Vytvoření (`/snidane/nova`) uloží záznam.
- [ ] Detail (`/snidane/:id`) odpovídá vytvořeným datům.
- [ ] Editace (`/snidane/:id/edit`) uloží změny.
- [ ] API endpoint `GET /api/v1/breakfast` odpovídá 200.

### 4.3 Ztráty a nálezy (`/ztraty-a-nalezy`)

- [ ] Seznam (`/ztraty-a-nalezy`) načte data.
- [ ] Vytvoření (`/ztraty-a-nalezy/novy`) uloží záznam.
- [ ] Detail (`/ztraty-a-nalezy/:id`) je dostupný.
- [ ] Editace (`/ztraty-a-nalezy/:id/edit`) uloží změny.
- [ ] API endpoint `GET /api/v1/lost-found` odpovídá 200.

### 4.4 Závady (`/zavady`)

- [ ] Seznam (`/zavady`) načte data.
- [ ] Vytvoření (`/zavady/nova`) uloží záznam.
- [ ] Detail (`/zavady/:id`) je dostupný.
- [ ] Editace (`/zavady/:id/edit`) uloží změny.
- [ ] API endpoint `GET /api/v1/issues` odpovídá 200.

### 4.5 Sklad (`/sklad`)

- [ ] Seznam (`/sklad`) načte data.
- [ ] Vytvoření položky (`/sklad/nova`) uloží záznam.
- [ ] Detail (`/sklad/:id`) je dostupný.
- [ ] Pohyb skladu (`POST /api/v1/inventory/:id/movements`) zapisuje změny.
- [ ] API endpoint `GET /api/v1/inventory` odpovídá 200.

### 4.6 Ostatní moduly – Hlášení (`/hlaseni`)

- [ ] Seznam (`/hlaseni`) načte data.
- [ ] Vytvoření (`/hlaseni/nove`) uloží záznam.
- [ ] Detail (`/hlaseni/:id`) je dostupný.
- [ ] Editace (`/hlaseni/:id/edit`) uloží změny.
- [ ] API endpoint `GET /api/v1/reports` odpovídá 200.

## 5) Provozní GO/NO-GO kritéria

Cutover je GO, pokud:

- Smoke testy jsou zelené.
- API `/health` je stabilně 200.
- Klíčové CRUD toky všech modulů jsou funkční.
- Nejsou regresní chyby bránící operativě recepce/housekeepingu.

NO-GO pokud:

- selže healthcheck API nebo web,
- některý kritický modul nelze otevřít / uložit,
- dochází ke ztrátě dat nebo nekonzistenci.

## 6) Rollback plan (okamžitý návrat)

### 6.1 Trigger rollbacku

Rollback spustit při:

- opakovaných 5xx chybách,
- nefunkčním přihlášení nebo kritických CRUD operacích,
- neakceptovatelném výkonu/latenci.

### 6.2 Kroky rollbacku

1. **Freeze změn**: zastavit další deploye nového portálu.
2. **Traffic switch back**:
   - hostname varianta: vrátit DNS/reverse proxy na legacy host.
   - path varianta: odstranit / deaktivovat `/new-portal` routování.
3. **Validace legacy**:
   - otevřít legacy home + kritické legacy workflow.
4. **Incident log**:
   - zaznamenat čas rollbacku, příčinu, symptomy a poslední release SHA.
5. **Post-mortem**:
   - opravit issue mimo produkční traffic a opakovat cutover až po retestu.

### 6.3 Odhad RTO

- Reverse proxy rollback: typicky minuty.
- DNS rollback: dle TTL (doporučení držet nízké TTL v cutover okně).

## 7) Poznámky k paralelnímu provozu

- Legacy portál je po dobu migrace referenční fallback.
- Nový portál je oddělen hostname/path vrstvou; proto je možné A/B ověření bez zásahu do legacy.
- Databázi a migrace provádět řízeně; před cutoverem udělat backup dle `docs/how-to-deploy.md`.
