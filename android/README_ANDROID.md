# Kajovo Hotel Android

Tento adresář je samostatný nativní Android projekt. Aktivní current-state provozní dokumentace pro Android je právě tento soubor.

## Co projekt skutečně obsahuje

- Kotlin DSL build přímo v `android/`
- single-activity aplikaci s Jetpack Compose a Hilt
- moduly `core/*` a `feature/*`
- session-first auth nad Retrofit + OkHttp + Moshi
- cookie-first session handling a CSRF header injection
- Room a DataStore pro lokální stav
- role-aware shell bez admin scope
- utility stavy `intro`, `offline`, `maintenance`, `not-found`, `access-denied`, `global-blocking-error`
- feature moduly `recepce`, `pokojská`, `snídaně`, `ztráty a nálezy`, `závady`, `sklad`, `hlášení`, `profil`
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
- veřejná APK musí být v `apps/kajovo-hotel-web/public/downloads/kajovo-hotel-android.apk`
- před releasem je povinné spustit `python scripts/check_android_release_integrity.py`
- pro podpis nového release artifactu z GitHub secrets slouží workflow `.github/workflows/android-signed-artifact.yml`

## Parita s webem

- Každá runtime změna Android aplikace musí být spojená i s adekvátní změnou webové verze.
- Každá runtime změna webu musí mít odpovídající runtime změnu Android appky.
- web musí být ověřený pro desktop, tablet a mobil
- Android musí mít samostatné nativní mobilní i tabletové chování, ne jen roztažený telefonní layout
- wrapper nebo WebView-first model není přípustný
- veřejný web na Androidu musí umět nabídnout otevření nativní appky a při nedostupnosti appky nabídnout instalaci release APK

## Historické materiály

Historická Android projektová evidence je přesunutá do `docs/archive/android-history/`.
Pokud je historický materiál v rozporu s kódem nebo s tímto README, přednost má kód a tento README.
