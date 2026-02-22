# ORF-07 API test CSRF/session fix Verification

## A) Cíl

Stabilizovat API unit test setup po auth změnách: zajistit start test API procesu, přidat validní CSRF token do write requestů a sjednotit test request flow přes autentizovanou admin session.

## B) Exit criteria

- API test fixture spouští uvicorn deterministicky bez timeoutu.
- Write requesty v API testech posílají platný `x-csrf-token` odpovídající cookie `kajovo_csrf`.
- `pnpm unit` prochází.
- `pnpm lint` a `pnpm typecheck` prochází.

## C) Změny

- Upraven `apps/kajovo-hotel-api/tests/conftest.py`:
  - uvicorn start z `apps/kajovo-hotel-api` cwd,
  - sdílený `api_request` fixture s admin login bootstrapem,
  - automatické přidání `x-csrf-token` pro write metody.
- Refaktor API testů (`test_breakfast`, `test_health`, `test_inventory`, `test_issues`, `test_lost_found`, `test_reports`) na sdílený autentizovaný request helper.
- Aktualizovaná test data/asserce dle aktuálních validačních schémat.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `pnpm unit`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## E) Rizika / known limits

- Testy používají bootstrap přes admin login (`admin@kajovohotel.local` / `admin123`) dle výchozího test configu.
- CSRF validace je nyní testovaná implicitně přes middleware; případná změna názvu cookie/headeru musí být promítnuta do fixture.

## F) Handoff pro další prompt

- Zachovat pattern: nový API test s write operacemi stavět nad sdíleným `api_request` fixture (neobcházet CSRF).
- Pokud se mění auth/cookie kontrakt, aktualizovat nejdřív fixture a až poté jednotlivé testy.
