# Build verification — final

## Finální seznam skutečně implementovaných modulů a flow

- `app` — single-activity shell, Hilt application, Compose navigation graph, utility state routing, role-aware guardy a profil/change-password/logout flow.
- `core/common` — základní shared utility vrstva, base URL config, logger, payload modely a result wrapper.
- `core/model` — role, identity, permission guardy, enumy feature stavů a session model.
- `core/network` — Retrofit + OkHttp + Moshi, cookie jar, CSRF injection, request-id interceptor, auth/session network event mapping a API surface pouze pro verified non-admin scope.
- `core/session` — cookie-first session repository, authoritative `/api/auth/me` flow, role-selection fallback ze snapshotu identity, logout cleanup a change-password relogin behavior.
- `core/database` — Room cache baseline pro modulové snapshoty.
- `core/designsystem` + `core/designsystem-tokens` — brand theme, typography, spacing, state pane a shared cards.
- `feature/auth/login` — login screen.
- `feature/auth/roles` — role selection screen.
- `feature/profile` — profil a změna hesla.
- `feature/utility` — intro, offline, maintenance, not-found, access-denied a global-blocking-error screeny.
- `feature/reception` — recepční hub bez dashboardu.
- `feature/breakfast` — role-aware list, denní souhrn, detail přes výběr položky, create/edit pro recepci, servisní varianta pro roli snídaně, import preview/confirm a export trigger.
- `feature/lostfound` — list, filtry, detail, create/edit a až 3 fotky.
- `feature/housekeeping` — quick capture přepínající závadu / nález, pokoj, popis, až 3 fotky a success state.
- `feature/issues` — list, filtry, detail, fotky a status update jen v backend guard mezích.
- `feature/inventory` — list a create movement z listu bez admin-only detail/edit flow.

## Co zůstalo záměrně mimo scope

- Admin scope, admin endpointy a admin obrazovky.
- Reports a dashboardy.
- WebView nebo hybridní wrapper.
- Non-admin inventory detail/create/edit/delete item flow.
- Maintenance issue create flow pro roli `údržba`.
- Jakékoliv build-time kroky přes Node, pnpm, vite, Python nebo externí OpenAPI generátor.

## Finální build, test a lint příkazy

- `bash -n android/gradlew` → PASS
- `python` statická kontrola module includes, dependency graph bez cyklu a unikátní namespace → PASS
- `python` kontrola UTF-8 bez BOM pro textové soubory v `android/` → PASS
- `python` shell/scope guard statické kontroly (`logout`, `change-password`, role routing, limity fotek, inventory scope) → PASS
- `rg -n "zakázané markery a runtime-stuby" ...` + kontrola markerů v `android/` → PASS
- `cd android && chmod +x gradlew && ./gradlew help` → FAIL
- `cd android && ./gradlew assembleDebug` → FAIL
- `cd android && ./gradlew testDebugUnitTest` → FAIL
- `cd android && ./gradlew lintDebug` → FAIL

## Přesný seznam odhalených a opravených problémů

1. Opraveny build skripty modulů: `jvmToolchain(17)` byl přesunut do validního top-level `kotlin {}` bloku pro Android moduly.
2. Odstraněn chybný `kotlin {}` blok z root `android/build.gradle.kts`, kde by bez aplikovaného Kotlin pluginu rozbíjel sync.
3. Do `android/app/build.gradle.kts` doplněna závislost `androidx.lifecycle.viewmodel.ktx`, kterou `AppStateViewModel` skutečně potřebuje pro `viewModelScope`.
4. Opravena syntaktická chyba v `core/network/ApiFailure.kt` při čtení `detail` z chybové odpovědi.
5. Uzavřen bug v auth/session flow: při `403 Active role must be selected` už nedochází k rekurzivnímu volání `restoreSession()`; repository nyní používá cache snapshot identity pro návrat na role-selection screen.
6. Rozšířen `SessionMetadataStore` o snapshot identity a odpovídající DataStore persistenci, aby se role-selection flow dalo obnovit i po cold startu bez porušení cookie-first modelu.
7. Aktualizovány unit testy session repository o scénář obnovy role selection ze snapshotu.
8. Zpevněny layouty s CTA v `lostfound` a `housekeeping`: akční tlačítka jsou full-width ve sloupci, aby nevznikal horizontální overflow.
9. Zpevněno vykreslení obrázků v `lostfound` a `issues`: přidány explicitní výšky pro thumbnail/detail render, aby nevznikaly kolapsy layoutu.
10. Historické krokové reporty v `android/` byly sanitizovány od textových markerů, které finální hardening výslovně zakazuje ponechat v subtree.

## Neodstraněné limitace prostředí

- Kontejner nemá síťový přístup na `services.gradle.org`, takže wrapper nemohl stáhnout Gradle 8.13 distribuci.
- Kontejner nemá Android SDK, proto zde nešlo reálně dokončit `assembleDebug`, unit tasky závislé na Android pluginu ani `lintDebug`.
- Instrumentační a Compose UI testy nebylo možné spustit bez zařízení nebo emulátoru.

## Finální doporučení pro otevření v Android Studiu

1. Otevřít přímo složku `android/` jako samostatný projekt.
2. Nastavit JDK 17.
3. Nechat wrapper stáhnout Gradle 8.13.
4. Po sync spustit v tomto pořadí: `assembleDebug`, `testDebugUnitTest`, `lintDebug`.
5. Potom ověřit device flow: login → `/api/auth/me` → role selection / role home, logout cleanup, change-password relogin, lost-found upload max 3 fotky a inventory movement submit.
