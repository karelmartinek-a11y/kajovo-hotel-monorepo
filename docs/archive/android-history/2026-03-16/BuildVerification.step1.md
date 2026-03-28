# Build verification — step 1

## Spuštěné příkazy

- `bash -n android/gradlew` → PASS
- `python` statická kontrola struktury modulů, `settings.gradle.kts` a očekávaných adresářů → PASS
- `python` statická kontrola, že `app` odkazuje na požadované `core/*` a `feature/*` moduly a že moduly mají namespace → PASS
- `cd android && ./gradlew --version` → FAIL

## Co skutečně prošlo

- Shell syntaxe bootstrap wrapperu `gradlew` je validní.
- Android subtree obsahuje samostatný Gradle root a všechny požadované moduly.
- `settings.gradle.kts` include-uje všechny deklarované moduly.
- `app/build.gradle.kts` odkazuje na všechny potřebné `core/*` a `feature/*` moduly.
- Všechny Android moduly mají vlastní namespace a manifest skeleton.
- Android subtree nevyžaduje `pnpm`, `node`, `vite`, `python` ani OpenAPI CLI pro samotný Android build.

## Co nešlo spustit a proč

Příkaz `cd android && ./gradlew --version` v tomto kontejneru selhal při bootstrapu Gradle distribuce, protože prostředí nemá síťový přístup na `services.gradle.org`. Současně v kontejneru není předinstalovaný Android SDK ani systémový Gradle. Z toho důvodu zde neproběhl skutečný `Gradle sync`, `assembleDebug` ani `:app:help`.

## Jaké opravy buildu byly během kroku potřeba

- Upraven bootstrap `gradlew`, aby korektně odstraňoval escapované zpětné lomítko z `distributionUrl` a vytvářel validní URL pro Gradle 8.13.
- Upraven `gradlew.bat` pro stejný účel na Windows straně.
- Opraven `AppModules.kt`, aby nepoužíval neexistující volání `fallbackToDestructiveMigration(false)`.
- Přepsán `KajovoHotelApp.kt` tak, aby role-driven `NavHost` vznikal deterministicky přes `key(activeRole)` a bez runtime reset logiky závislé na nehotovém grafu.

## Finální seznam klíčových verzí

- Android Studio baseline: `Panda 2 | 2025.3.2`
- JDK: `17`
- Gradle: `8.13`
- AGP: `8.12.2`
- Kotlin: `2.2.20`
- Compose compiler plugin: `2.2.20`
- compileSdk: `35`
- targetSdk: `35`
- minSdk: `26`

## Potvrzení samostatnosti Android subtree

Android projekt je založen jako samostatný subtree v `android/` a je navržený pro přímé otevření složky `android/` v Android Studiu. Build konfigurace neodkazuje na monorepo toolchain `pnpm`, `node`, `vite`, `python`, OpenAPI CLI ani jiné cizí build kroky.
