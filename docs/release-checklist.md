# Release checklist

- Ověřit `git status`, `git diff` a že commit neobsahuje secrets.
- Spustit `pnpm ci:gates` a relevantní regresní testy změněných modulů.
- Ověřit branding `Kájovo Hotel`, responzivitu a hlavní provozní toky.
- Pushnout commit přímo na `main`, bez PR, a ověřit oba CI jobs nad finálním SHA.
- Nasadit na `89.221.222.92` podle aktuálního deploy workflow.
- Potvrdit živé chování na `https://hotel.hcasc.cz` a `https://hotel.hcasc.cz/admin`.
