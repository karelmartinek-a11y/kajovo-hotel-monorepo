# WEB_IMPLEMENTATION_PLAN.md — KájovoHotel web

## 1) Mapa architektury repozitáøe relevantní pro web
- Web/portal frontend (hotel.hcasc.cz): `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web`
  - Entrypoint: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\main.tsx`
  - Portal login: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\portal\PortalLoginPage.tsx`
  - Portal routes/shell: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\portal\PortalRoutes.tsx`
  - RBAC (web): `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\rbac.ts`
  - UI tokens + shared UI: `C:\github\kajovo-hotel-monorepo\packages\ui`, `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel\ui-tokens`
- Admin frontend (separátní app): `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-admin`
  - Entrypoint + admin routing: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-admin\src\main.tsx`
  - RBAC (admin): `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-admin\src\rbac.ts`
- Backend API: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api`
  - FastAPI app: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\main.py`
  - API routes: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\api\routes\*.py`
  - DB/ORM: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\db\models.py`
  - Migrations: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\alembic\versions\*.py`
- Sdílené API klienty/typy: `C:\github\kajovo-hotel-monorepo\packages\shared\src\generated\client.ts`
- IA + design SSOT nav: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel\ux\ia.json`

## 2) Pøesné nalezené cesty k Manifestu, brand assetùm, pipeline a testùm
- Závazný Manifest designu (SSOT): `C:\github\kajovo-hotel-monorepo\ManifestDesignKájovo.md`
- Brand (root assets): `C:\github\kajovo-hotel-monorepo\brand\`
  - Logo exporty pro KájovoHotel: `C:\github\kajovo-hotel-monorepo\brand\apps\kajovo-hotel\logo\exports\`
  - Signace: `C:\github\kajovo-hotel-monorepo\brand\signace\signace.svg` (+ pdf/png)
  - Panel PNG návrhy: `C:\github\kajovo-hotel-monorepo\brand\panel\*.png`
- Brand (web public): `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\public\brand\`
  - Wordmark pro web: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\public\brand\apps\kajovo-hotel\logo\exports\wordmark\svg\kajovo-hotel_wordmark.svg`
  - Signace pro web: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\public\brand\signace\signace.svg`
  - Postavy (Kája): `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\public\brand\postavy\kaja-admin.png`, `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\public\brand\postavy\kaja-user.png`
  - Panel PNG pro web (login/menu stavy): `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\public\brand\panel\*.png`
- CI/CD workflow:
  - `C:\github\kajovo-hotel-monorepo\.github\workflows\ci-gates.yml`
  - `C:\github\kajovo-hotel-monorepo\.github\workflows\ci-full.yml`
  - `C:\github\kajovo-hotel-monorepo\.github\workflows\deploy-production.yml`
- CI pravidla a PR/merge gate:
  - `C:\github\kajovo-hotel-monorepo\docs\ci-gates.md`
  - `C:\github\kajovo-hotel-monorepo\docs\developer-handbook.md`
- Testy a e2e:
  - Web: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\tests\*`
  - Admin: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-admin\tests\*`
  - API: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\tests\*`

## 3) Návrh implementace po krocích/commitech
1. RBAC + navigace + admin shell
   - Ovìøit IA/role mapping proti: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel\ux\ia.json`, `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\rbac.ts`, `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\security\rbac.py`.
   - Zafixovat role gating v portálu i adminu, UI + API konzistence.
2. Správa uživatelù
   - Admin UI a API už existuje: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-admin\src\main.tsx`, `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\api\routes\users.py`.
   - Dotažení validací a UX dle Manifestu designu.
3. Sklad
   - UI: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\main.tsx` (portal) + `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-admin\src\main.tsx` (admin).
   - API: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\api\routes\inventory.py` + media storage `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\media\storage.py`.
4. Nálezy + závady + pokojská
   - UI: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\main.tsx` (lost_found/issues), menu/role: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\rbac.ts`.
   - API: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\api\routes\lost_found.py`, `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\api\routes\issues.py`.
5. Snídanì + import PDF
   - UI: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\main.tsx`.
   - API + PDF import: `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\api\routes\breakfast.py`, parser `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\services\breakfast\parser.py`.
6. Finální testy + pipeline parity + PR/merge
   - Spustit lokální ovìøení dle `C:\github\kajovo-hotel-monorepo\docs\ci-gates.md` a `C:\github\kajovo-hotel-monorepo\docs\developer-handbook.md`.

## 4) Návrh DB zmìn a API zmìn
- DB zmìny: zatím neurèeno (bez domnìnek). Nejprve audit potøeby podle modulù a parity v `C:\github\kajovo-hotel-monorepo\docs\feature-parity-matrix.csv`.
- API zmìny: zatím neurèeno (bez domnìnek). Pokud se dotkne API, postupovat pøes OpenAPI generaci:
  - `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\scripts\export_openapi.py`
  - `C:\github\kajovo-hotel-monorepo\packages\shared\src\generated\client.ts`

## 5) Rizika, otevøené otázky a doporuèené øešení bez domnìnek
- Generování PDF: v repozitáøi jsem nenašel žádné PDF export/generátor (nalezen pouze import PDF snídaní). Doporuèení: potvrdit požadavek na PDF export a definovat SSOT zdroj (API/klient).
- Mobilní PNG návrhy pro web: existují panel PNG v `C:\github\kajovo-hotel-monorepo\brand\panel\*.png` a jejich kopie v `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\public\brand\panel\*.png`. Je potøeba potvrdit, které obrazovky pøesnì odpovídají web flow (login/admin/role menu).
- Role mapování (pokojská/údržba/recepce/snídanì/sklad): definice jsou v `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-web\src\rbac.ts` a `C:\github\kajovo-hotel-monorepo\apps\kajovo-hotel-api\app\security\rbac.py`. Doporuèení: pøi UI zmìnách držet RBAC konzistentní s API.

## 6) Pøesné pøíkazy pro lokální ovìøení, které jsi našel v repu
- Root CI/lint:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm unit`
  - `pnpm ci:gates`
- Web:
  - `pnpm --filter @kajovo/kajovo-hotel-web lint`
  - `pnpm --filter @kajovo/kajovo-hotel-web test`
  - `pnpm --filter @kajovo/kajovo-hotel-web test:visual`
- Admin:
  - `pnpm --filter @kajovo/kajovo-hotel-admin lint`
  - `pnpm --filter @kajovo/kajovo-hotel-admin test`
  - `pnpm --filter @kajovo/kajovo-hotel-admin test:smoke`
- API:
  - `python -m pytest apps/kajovo-hotel-api/tests`

