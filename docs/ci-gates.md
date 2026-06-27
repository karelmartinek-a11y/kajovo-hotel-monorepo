# CI gates

Aktivní blokující kontroly jsou zaměřené na web, admin, API a produkční deploy integritu.

## Hlavní gate

- `pnpm ci:policy`
- `pnpm ci:policy-test`
- `pnpm ci:tokens`
- `pnpm ci:brand-assets`
- `pnpm ci:signage`
- `pnpm ci:text-integrity`
- `pnpm ci:runtime-integrity`
- `pnpm ci:web-smoke`
- `pnpm ci:visual`

Legacy Android release integrity ani Android smoke už nejsou blokující CI gate.
