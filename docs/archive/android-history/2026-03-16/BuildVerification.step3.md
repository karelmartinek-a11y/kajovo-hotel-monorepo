# Build verification — step 3

## Seznam implementovaných feature modulů

- `feature/reception` — recepční hub ponechán jako čistý non-dashboard vstup do `breakfast` a `lostfound`.
- `feature/breakfast` — role-aware list, daily summary, detail přes výběr položky, create/edit pro recepci, servisní varianta pro roli `snídaně`, import preview + confirm přes systémový document picker a export trigger.
- `feature/lostfound` — list, filtry, detail, create, edit, upload až 3 fotografií a thumbnail/detail image loading.
- `feature/housekeeping` — quick capture přepínající `issue` / `lost_found`, pokoj, krátký popis, až 3 fotky a success state.
- `feature/issues` — list, filtry, detail, fotky a update status jen v mezích backend guardů `new -> in_progress -> resolved`.
- `feature/inventory` — list skladu a create movement z listu bez non-admin detail/create/edit/delete item flow.

## Co bylo vědomě mimo scope

- Admin dashboardy, reports, exporty mimo `breakfast` manager flow a jakýkoliv admin inventory export.
- Non-admin detail / create / edit / delete inventory itemu.
- Maintenance issue create flow pro roli `údržba`.
- Jakýkoliv admin endpoint nebo admin obrazovka.
- WebView wrapper nebo hybridní fallback.

## Jak byly respektovány backend limity

- `breakfast` manager akce zůstaly jen pro recepci; servisní role `snídaně` dostává pouze list/detail + mark served.
- `lost_found` používá hyphen route `/api/v1/lost-found`; upload je omezen na 3 fotografie.
- `issues` pro maintenance nenabízí create a v UI i logice dovoluje jen status přechody potvrzené backendem.
- `inventory` nabízí jen list a `POST /api/v1/inventory/{item_id}/movements`.
- `housekeeping` zakládá issue nebo lost-found jen přes housekeeping write scope a používá nativní uploady.
- Shell route guardy z kroku 2 zůstaly beze změny a byly doplněny o feature-level permission testy.

## Spuštěné build a kontrolní příkazy

- `bash -n android/gradlew` → PASS
- `python` statická kontrola, že step 3 feature moduly a testy existují → PASS
- `python` kontrola include záznamů ve `android/settings.gradle.kts` → PASS
- `python` kontrola feature `build.gradle.kts` pro Hilt/KSP/network wiring → PASS
- `grep -RInE 'placeholder_markers' android/app android/core android/feature` → PASS
- `python` kontrola UTF-8 bez BOM pro nově upravené soubory → PASS
- `cd android && chmod +x gradlew && ./gradlew tasks` → FAIL

## Co prošlo

- Feature moduly mají skutečné `data/domain/presentation` rozdělení.
- Všechny cílové non-admin feature moduly mají skutečné Compose screeny a repository vrstvy.
- Hilt/KSP/network wiring je doplněno ve feature build skriptech.
- V `android/` nejsou ponechané placeholder markery typu `placeholder markerů`.
- Nově vytvořené a upravené textové soubory jsou bez BOM.

## Co nešlo spustit a proč

- `cd android && ./gradlew tasks` skončil při bootstrapu Gradle distribuce, protože kontejner nemá síťový přístup na `services.gradle.org`.
- K dispozici není Android SDK, takže zde nešlo spustit `assembleDebug`, `testDebugUnitTest`, Compose UI testy ani instrumentační testy.

## Seznam zbylých technických rizik před finálním hardeningem

- Chybí reálný `Gradle sync` a build verifikace v prostředí s Android SDK a povoleným přístupem na Gradle distribuci.
- Systémové pickery a síťové uploady jsou implementované, ale nebyly v tomto offline kontejneru exekučním testem ověřené.
- Feature moduly jsou uzavřené pro verified non-admin scope, ale pořád zbývá finální hardening: error polish, analytics/logging polish a connected test běh na zařízení/emulátoru.
