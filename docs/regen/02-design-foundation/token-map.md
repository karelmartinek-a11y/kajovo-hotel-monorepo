# Token map — Design foundation (KájovoHotel)

## SSOT token sources

- `apps/kajovo-hotel/ui-tokens/tokens.json` — canonical token schema (barvy, spacing, radius, typografie, z-index, signage).  
- `packages/ui/src/tokens.css` — runtime CSS token implementation používaná Portal i Admin UI.
- `apps/kajovo-hotel/ui-tokens/tokens.css` — pouze delegace (`@import`) na `packages/ui/src/tokens.css`, aby nevznikala duplicitní token implementace.

## Mapping tokenů do UI

| Token domain | Source | Runtime usage |
|---|---|---|
| Colors (`brand red/white`, metal, subtle-metal, states) | `apps/kajovo-hotel/ui-tokens/tokens.json` + `packages/ui/src/tokens.css` | komponenty `Card`, `Badge`, `DataTable`, `StateView`, `AppShell` |
| Spacing (8pt grid) | `apps/kajovo-hotel/ui-tokens/tokens.json.spacing` | `--k-spacing-*` v `packages/ui/src/tokens.css` |
| Radius (`r0/r8/r12/r16`) | `apps/kajovo-hotel/ui-tokens/tokens.json.radius` | `--k-radius-*` v UI komponentách |
| Typography (Montserrat, sizes, line-heights) | `apps/kajovo-hotel/ui-tokens/tokens.json.typography` | `--k-font-*`, `--k-line-height-*` |
| Z-index (včetně signace) | `apps/kajovo-hotel/ui-tokens/tokens.json.zIndex` | `--k-z-*`, `.kajovo-sign` |
| Signage | `apps/kajovo-hotel/ui-tokens/tokens.json.signage` + `brand/signace/signace.svg` | `packages/ui/src/shell/KajovoSign.tsx` |

## Panel layout mechanism

- `packages/ui/src/shell/AppShell.tsx` přijímá `panelLayout: 'admin' | 'portal'`.
- `panelLayout` se propaguje přes `data-panel-layout` na root shell.
- `packages/ui/src/tokens.css` aplikuje panelové layout tokeny (`--k-panel-*`) podle `data-panel-layout`.
- `apps/kajovo-hotel-web/src/main.tsx` vybírá layout podle role (`admin` => admin panel, ostatní => portal panel).

