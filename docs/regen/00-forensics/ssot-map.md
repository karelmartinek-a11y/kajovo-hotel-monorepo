# SSOT mapa (forenzní inventura)

## Primární SSOT artefakty

- `ManifestDesignKájovo.md` — hlavní design/produktový manifest pro KájovoHotel.
- `brand/**` (včetně `brand/panel/**`) — brand assety a vizuální panelové zadání.
- `apps/kajovo-hotel/ux/ia.json` — informační architektura, moduly, routy, view-state policy.
- `docs/**` a `docs/regen/**` — forenzní evidence, parity mapy, rozhodnutí a verifikace.

## SSOT -> implementační cíle v monorepu

- UX/IA SSOT (`apps/kajovo-hotel/ux/ia.json`) mapuje na SPA routy ve `apps/kajovo-hotel-web/src/main.tsx`.
- API kontrakt a modulová parita mapuje na `apps/kajovo-hotel-api/app/api/routes/*.py` + `apps/kajovo-hotel-api/app/db/models.py`.
- Branding/signace mapuje na:
  - `packages/ui/src/shell/KajovoSign.tsx`
  - `packages/ui/src/tokens.css`
  - `brand/apps/kajovo-hotel/logo/**`

## Forenzní evidence použité při mapování

- Legacy evidence (read-only): `legacy/**`.
- Aktuální cílový systém: `apps/**`, `packages/**`, `infra/**`, `docs/**`.
- Panelové podklady: `brand/panel/*`.

## Poznámka ke scope

Tato mapa je pouze orientační index SSOT zdrojů; detailní inventury jsou v:
- `docs/regen/00-forensics/legacy-inventory.md`
- `docs/regen/00-forensics/new-system-inventory.md`
- `docs/regen/00-forensics/brand-panel-map.md`
- `docs/regen/parity/parity-map.yaml`
