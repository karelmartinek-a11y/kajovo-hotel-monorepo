# Verification – 05 main-tsx-conflict-resolution

## cíl
Snížit merge konflikty v `apps/kajovo-hotel-web/src/main.tsx` a zachovat admin/portal split routingu bez regresí.

## co se změnilo
- Refaktorována routing část do menších komponent:
  - `AdminShellRoutes`
  - `PortalShellRoutes`
  - tenčí `AppRoutes`
- Zachováno chování:
  - `/admin/login` + `/admin/*` s `panelLayout="admin"`
  - `/login` + portal tree s `panelLayout="portal"`
- Změna je strukturální (lepší mergeabilita), bez změny funkčních route cílů.

## jak ověřeno
- `pnpm -C apps/kajovo-hotel-web lint`
  - očekávání: TypeScript bez chyb.
- `pnpm -C apps/kajovo-hotel-web build`
  - očekávání: produkční build proběhne.

## rizika/known limits
- Konflikt na GitHubu je dán stavem base/head branch; tento commit minimalizuje konfliktní plochu v `AppRoutes`, ale definitivní mergeability závisí na aktuální větvi `main`.
