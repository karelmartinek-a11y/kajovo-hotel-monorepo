# Release checklist

- Ověřit `git status`, `git diff` a že commit neobsahuje secrets.
- Spustit relevantní lint, typecheck, build a testy.
- Ověřit branding `Kájovo Hotel`, responzivitu a hlavní provozní toky.
- Pushnout změny a ověřit, že `main` obsahuje finální commit.
- Nasadit na `89.221.222.92` podle aktuálního deploy workflow.
- Potvrdit živé chování na `https://hotel.hcasc.cz` a `https://hotel.hcasc.cz/admin`.
