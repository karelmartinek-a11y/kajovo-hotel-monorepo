# Build verification — step 2

## Co bylo implementováno

- Dokončen cookie-first auth/session shell nad `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/select-role`, `POST /api/auth/logout`, `GET/PATCH /api/auth/profile` a `POST /api/auth/change-password`.
- Přidán autoritativní bootstrap identity přes `GET /api/auth/me` po loginu i po výběru role.
- Dopsán secure cookie persistence wrapper, CSRF header injection z cookie `kajovo_csrf` a session guard interceptor pro `401`, `403 Active role must be selected`, `503` a offline chyby.
- Dopsán `DefaultSessionRepository` včetně logout cleanup logiky pro cookie store, DataStore metadata a Room cache.
- Dopsán `AppStateViewModel` s odběrem síťových auth/session eventů.
- Dopsán root destination resolver a guarded navigation pro login, role selection, access denied, profile a role-home routy.
- Dopsány základní JVM testy pro auth/session repository, error mapping a routing shell.
- Doplněn baseline token-only login a change-password UI o skrytí hesla pomocí password transformation.

## Spuštěné build a kontrolní příkazy

- `bash -n android/gradlew` → PASS
- `python` statická kontrola povinných step 2 souborů → PASS
- `python` kontrola, že v `android/` nejsou placeholder markery `placeholder markerů` → PASS
- `python` kontrola UTF-8 bez BOM v textových souborech → PASS
- `cd android && ./gradlew --version` → FAIL

## Co skutečně prošlo

- Wrapper skript `gradlew` má validní shell syntaxi.
- V `android/` existují všechny nové auth/session/shell soubory požadované tímto krokem.
- V `android/` nejsou ponechané placeholder markery typu `dočasných markerů.
- Textové soubory vytvořené v tomto kroku jsou bez BOM.

## Co nešlo spustit a proč

- `cd android && ./gradlew --version` selhal při bootstrapu Gradle distribuce, protože kontejner nemá síťový přístup na `services.gradle.org`.
- V kontejneru současně není Android SDK, takže zde nešlo spustit skutečný `Gradle sync`, `testDebugUnitTest`, `assembleDebug` ani Compose/instrumentační testy.

## Je auth/session flow buildově a architektonicky uzavřené?

Z hlediska návrhu a zdrojového kódu ano:

- login je cookie-first,
- po loginu následuje autoritativní `GET /api/auth/me`,
- cold start session není uznávaná bez `GET /api/auth/me`,
- `401` vede na lokální cleanup a login,
- `403 Active role must be selected` vede do role-selection větve,
- logout čistí cookie store, DataStore i Room cache,
- změna hesla po úspěchu vynucuje nové přihlášení,
- guarding shellu je postavený na `permissions`, `roles`, `active_role` a `actor_type`.

Reálné kompilovatelné uzavření ale stále nebylo možné exekučním buildem ověřit v tomto offline kontejneru.

## Seznam zbývajících rizik před feature implementací

- Chybí skutečný `Gradle sync` a Android SDK build ověření v prostředí s JDK 17 + Android SDK + přístupem na Gradle distribuci.
- Základní JVM testy byly pouze zapsány; nebylo možné je zde spustit přes Gradle.
- Feature moduly mimo core shell zatím nejsou dotažené do produkční logiky a budou potřebovat vlastní repository/API/test vrstvu v dalším kroku.
