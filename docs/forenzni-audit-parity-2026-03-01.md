# Forenzni audit parity legacy -> kajovo-hotel-monorepo (2026-03-01)

## Rozsah
- Legacy zdroje: `legacy/hotel-backend`, `legacy/hotel-frontend`
- Aktualni zdroje: `apps/kajovo-hotel-api`, `apps/kajovo-hotel-web`, `apps/kajovo-hotel-admin`, `packages/*`

## Zavazny vysledek
Cilem je 1:1 funkcni parity modulu a bezpecnostnich pravidel podle zadani + manifestu, bez odchylek v produkci `hotel.hcasc.cz`.

## Nalezy (kriticke)

### 1) Snidanovy servis: PDF import + IMAP fetch CHYBI
- Legacy dukaz:
  - `legacy/hotel-backend/app/web/routes_admin.py:311` (`/admin/breakfast/import`, `UploadFile`)
  - `legacy/hotel-backend/app/services/breakfast/mail_fetcher.py:114` (`_iter_pdf_attachments`)
  - `legacy/hotel-backend/app/services/breakfast/parser.py:107` (`parse_breakfast_pdf`)
- Aktualni stav:
  - `apps/kajovo-hotel-api/app/api/routes/breakfast.py:38` obsahuje pouze CRUD + summary.
- Dopad: nesplnen pozadavek importu PDF a navazaneho procesu.

### 2) Zavady/Ztraty: fotodokumentace CHYBI
- Legacy dukaz:
  - `legacy/hotel-backend/app/api/reports.py:151` (multipart `UploadFile`)
  - `legacy/hotel-backend/app/db/models.py:252` (`ReportPhoto` + thumbnail)
- Aktualni stav:
  - `apps/kajovo-hotel-api/app/api/routes/issues.py:65` jen JSON
  - `apps/kajovo-hotel-api/app/api/routes/lost_found.py:55` jen JSON
- Dopad: chybi nahrani fotek, thumb pipeline, media vazby.

### 3) Sklad: preddefinovane polozky + piktogramy CHYBI
- Legacy dukaz:
  - `legacy/hotel-backend/app/db/models.py:467` (`InventoryIngredient` + `pictogram_path`)
  - `legacy/hotel-backend/app/web/routes_inventory.py:147` (`_store_pictogram_for_ingredient`)
- Aktualni stav:
  - `apps/kajovo-hotel-api/app/db/models.py:157` (`InventoryItem` bez ikon/piktogramu)
  - `apps/kajovo-hotel-api/app/api/schemas.py:200` nema pole pro ikonografii
- Dopad: neodpovida legacy skladu ani pozadavku na vlastni ikony.

## Nalezy (bezpecnost/auth)

### 4) Admin login pravidla
- V API je lockout + forgot throttle + unlock token implementovany.
- Dulezita oprava provedena: trim hesla pri loginu (`apps/kajovo-hotel-api/app/api/routes/auth.py:163`).
- Dulezita oprava provedena: pokud je session admin aktivni a stranka je `/admin/login`, je redirect na dashboard (`apps/kajovo-hotel-admin/src/main.tsx:1855`).

## Nalezy (CI/CD)

### 5) Deploy workflow mel race/fragilitu na SSH key kroku
- Opraven fallback na password deploy, pokud key krok selze.
- Soubor: `.github/workflows/deploy-production.yml`.

## Realizacni checklist (zavazny)
1. Dodat breakfast PDF import endpoint + parser flow + UI + ulozeni artefaktu.
2. Dodat IMAP fetch konfiguraci + scheduler/runner + admin nastaveni.
3. Dodat photo upload API pro issues/lost-found (multipart), DB tabulky fotek, thumbnail pipeline, media endpointy.
4. Dodat UI formularove uploady fotek do obou modulu.
5. Rozsirit inventory model o ikonografii/piktogramy + upload endpoint + render v UI.
6. Zavest seed preddefinovanych skladovych polozek s ikonami.
7. Provest forenzni PASS/FAIL test matrix pro kazdy modul na produkci.

## Definice hotovo
- Vsechny body checklistu splnene.
- Sandbox testy + build + deploy + produkcni smoke pro vsechny moduly PASS.
- Zadne odchylky proti legacy rozsahu v kritickych funkcich vyjmenovanych vyse.
