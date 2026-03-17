# Kajovo Hotel Android

Tento adresář je samostatný Android Studio projekt pro čistě nativní Android aplikaci nad verifikovaným non-admin scope portálu `hotel.hcasc.cz`.

## Co projekt skutečně obsahuje

- Kotlin DSL build přímo v `android/` bez závislosti na `pnpm`, `node`, `vite`, `python` nebo OpenAPI codegenu.
- Single-activity app s Jetpack Compose a Hilt.
- Modulární strukturu `core/*` a `feature/*` podle `KajovoHotelAndroid.md`.
- Session-first auth vrstvu s Retrofit + OkHttp + Moshi, cookie-first session handling a CSRF header injection.
- Room cache baseline, DataStore metadata store a Keystore-backed cookie vault.
- Role-aware shell bez admin scope, reports a dashboardu.
- Utility state screeny `intro`, `offline`, `maintenance`, `not-found`, `access-denied`, `global-blocking-error`.
- Verified non-admin feature moduly pro recepci, snídaně, lost-found, housekeeping quick capture, závady a skladové pohyby.

## Otevření v Android Studiu

1. Otevři přímo složku `android/` jako samostatný projekt.
2. Nastav JDK 17.
3. Nech projekt stáhnout Gradle 8.13 podle `gradle/wrapper/gradle-wrapper.properties`.
4. Po prvním sync spusť `:app:assembleDebug`.

## Doporučené příkazy

```bash
cd android
chmod +x gradlew
./gradlew help
./gradlew assembleDebug
./gradlew testDebugUnitTest
./gradlew lintDebug
```

## Runtime konfigurace

Výchozí runtime base URL je `https://hotel.hcasc.cz`.

Override bez zásahu do zdrojových souborů:

```bash
./gradlew -PkajovoHotelBaseUrl=https://hotel.hcasc.cz :app:assembleDebug
```

Projekt neobsahuje žádná tajemství ani produkční credentials.

## Standard verzování Android appky

Každá uživatelsky viditelná změna Android aplikace musí být vydaná jako nová verze. Nestačí push zdrojových kódů.

Povinný release postup:

1. Zvednout `versionCode` a `versionName` v `android/app/build.gradle.kts`.
2. Zvednout `android_app_version` v `apps/kajovo-hotel-api/app/config.py`.
3. Upravit související testy a očekávání verze, minimálně `apps/kajovo-hotel-api/tests/test_android_release.py`.
4. Sestavit novou APK.
5. Nahradit veřejný soubor `apps/kajovo-hotel-web/public/downloads/kajovo-hotel-android.apk`.
6. Ověřit po deploy, že `https://hotel.hcasc.cz/api/app/android-release` vrací stejnou verzi jako produkční APK na `https://hotel.hcasc.cz/downloads/kajovo-hotel-android.apk`.

Auto-update v aplikaci je navázaný na backend metadata a veřejnou APK na produkci. Pokud se nezvedne verze i veřejná APK současně, změna se uživatelům nepropíše.

## Scope, který je záměrně mimo projekt

- Admin scope.
- Reports a dashboardy.
- WebView nebo hybridní wrapper.
- Non-admin inventory detail/create/edit/delete item flow.
- Maintenance issue create flow pro roli `údržba`.

## Poznámka k ověření

V tomto kontejneru nebylo možné provést reálný Android build, protože chybí Android SDK a síť pro stažení Gradle distribuce. Statické wiring kontroly a final hardening jsou zdokumentované ve `BuildVerification.final.md`.
