# Kajovo Hotel Android

Tento adresář je samostatný nativní Android projekt pro ověřený non-admin scope portálu. Úplný soupis obrazovek, prvků a validací je v `docs/android-native-app-forensic-2026-09-18.md`, návrhový systém v `docs/android-native-design.md`.

## Co projekt skutečně obsahuje

- Kotlin DSL build přímo v `android/`
- single-activity aplikaci s Jetpack Compose a Hilt
- moduly `core/*` a `feature/*`
- session-first auth nad Retrofit + OkHttp + Moshi
- cookie-first session handling a CSRF header injection
- Room a DataStore pro lokální stav
- role-aware shell bez admin scope
- utility stavy `intro`, `offline`, `maintenance`, `not-found`, `access-denied`, `global-blocking-error`
- feature moduly `recepce`, `pokojská` včetně serverově ověřovaného přehledu pokojů, `snídaně`, `ztráty a nálezy`, `závady`, `sklad`, `hlášení`, `profil`
- adaptivní mobilní a tabletové rozložení pro vstupní a profilové veřejné obrazovky
- deep link handshake mezi webem a Androidem přes `kajovohotel://open/...` a app-link metadata v `apps/kajovo-hotel-web/public/.well-known/assetlinks.json`
- best-effort update flow podle `/api/app/android-release`

## Co projekt záměrně neobsahuje

- admin rozhraní
- web wrapper nebo WebView-first řešení

## Otevření v Android Studiu

1. Otevři přímo složku `android/`.
2. Použij JDK 17.
3. Synchronizuj Gradle.
4. Spusť `:app:assembleDebug`.

## Doporučené příkazy

```bash
cd android
./gradlew assembleDebug
./gradlew testDebugUnitTest
./gradlew lintDebug
```

Na Windows:

```powershell
cd android
.\gradlew.bat assembleDebug
.\gradlew.bat testDebugUnitTest
.\gradlew.bat lintDebug
```

## Release pravidla

- Každá uživatelsky viditelná změna Android appky musí být vydaná jako nová verze.
- Jediný zdroj pravdy pro Android release metadata je `android/release/android-release.json`.
- produkční APK musí být podepsaná původním produkčním klíčem; release build bez čtyř `KAJOVO_UPLOAD_*` hodnot záměrně selže
- veřejná APK, release manifest a veřejný endpoint `/api/app/android-release` se publikují atomicky; Android před instalací ověří SHA-256 a systém vyžádá potvrzení uživatele
- samostatný workflow `.github/workflows/android-ci.yml` ověřuje debug build, unit testy a lint a neblokuje webový deploy

## Parita s webem

- Při změně sdíleného API se ověří jeho skuteční producenti a spotřebitelé.
- Čistě webová změna nesmí být blokována Androidem; Android má vlastní CI a release gate.
- Android musí mít samostatné nativní mobilní i tabletové chování, ne jen roztažený telefonní layout.
- wrapper nebo WebView-first model není přípustný
- veřejný web může po vydání nabídnout otevření nativní appky a instalaci ověřené release APK

## Historické materiály

Historická Android projektová evidence je přesunutá do `docs/archive/android-history/`.
Pokud je historický materiál v rozporu s kódem nebo s tímto README, přednost má kód a tento README.
