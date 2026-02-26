# KájovoHotel monorepo

Tento repozitář je nový cílový monorepo pro refaktor:
- legacy/hotel-frontend
- legacy/hotel-backend

SSOT pravidla: `ManifestDesignKájovo.md`.

Primární cíle:
- apps/kajovo-hotel-web
- apps/kajovo-hotel-api
- packages/ui
- packages/shared
- apps/kajovo-hotel (tokeny/paleta/motion/IA dle manifestu)


## Security: povinné env proměnné pro legacy backend

`legacy/hotel-backend` nesmí používat hardcoded přihlašovací údaje. Následující proměnné musí být nastavené přes prostředí (bez výchozích hodnot v repozitáři):

- `HOTEL_ADMIN_USERNAME`
- `HOTEL_ADMIN_PASSWORD_HASH`
- `HOTEL_SESSION_SECRET`
- `HOTEL_CSRF_SECRET`
- `HOTEL_CRYPTO_SECRET`

Pro `legacy/hotel-backend/deploy/sandbox/run-tests.sh` jsou navíc povinné:

- `HOTEL_ADMIN_PASSWORD`
- `HOTEL_SANDBOX_POSTGRES_PASSWORD`

Pozn.: Do dokumentace ani do kódu nepatří konkrétní hodnoty těchto proměnných.
