# 1. Titulek a status dokumentu

**Kajovo Hotel Android — technicky ověřený návrh nativní user aplikace**

Status dokumentu: `proposal_complete`  
Datum: `2026-03-16`  
Revize: `ověřeno proti aktuální čisté repo revizi`  
Typ dokumentu: návrh architektury a delivery plánu, nikoli implementace.

Tento dokument navazuje na `android/KajovoHotelAndroid.audit.md` a používá jen scope, role, endpointy a design omezení, které byly skutečně dohledané v rozbaleném repozitáři a v KDGS. Tato revize je znovu ověřená proti aktuálnímu ZIP vstupu `kajovo-hotel-monorepo-main (5).zip`; potvrzuje admin-init reset hesla (`/login/reset` + `POST /api/auth/reset-password`) i sjednocený RBAC kontrakt pro roli `sklad`. Kde repo nebo audit neposkytují plný důkaz, je to výslovně označeno jako `PŘEDPOKLAD`, `RISK`, `GAP` nebo `BACKEND PREREQUISITE`.

# 2. Executive summary

Navržená Android aplikace je realizovatelná jako samostatný nativní projekt v adresáři `android/`, oddělený od současného pnpm/Python stacku. Bezpečný směr je samostatný Gradle build s Kotlin DSL, single-activity architekturou, Jetpack Compose UI, Hilt DI, Retrofit + OkHttp + Moshi, Room pro read-through cache a striktním napojením na stávající session/cookie auth model backendu. Auth blocker kolem resetu hesla je v této repo revizi odstraněný a RBAC kontrakt pro roli `sklad` je už srovnaný mezi backendem, shared vrstvou a dokumentací.

V1 musí být omezená na skutečně ověřený non-admin scope z auditu:
- login,
- session restore,
- role selection,
- profil a změnu hesla,
- utility stavy,
- recepce hub,
- pokojská quick capture,
- snídaně,
- ztráty a nálezy,
- závady,
- skladový list + pohyb.

V1 nesmí obsahovat admin scope, reports, dashboard, web wrapper, WebView-first směr ani inventurní/admin detail skladových položek. Návrh se opírá o backendovou permission realitu a o aktuální routy portálu, nikoli o širší, driftující nebo historické dokumenty.

Realizace je technicky možná bez backend změn pro login, session restore, role switching, profil, admin-init reset completion a většinu user modulů. Aktuální stav repozitáře už nemá otevřený RBAC blocker pro roli `sklad`; zbývají jen běžná rozhodnutí o rozsahu Android v1.

Z build-stack pohledu je návrh platný pouze jako oddělený Android subtree s vlastním Gradle wrapperem, bez povinné runtime závislosti na Node, pnpm nebo Python toolchainu při Android buildu. Tím se minimalizuje riziko build stack kolapsu.

# 3. Zdroje a auditované vstupy z repozitáře

Primární vstupy použité pro tento návrh:
- `android/KajovoHotelAndroid.audit.md`
- `android/KajovoHotelAndroid.handoff.json`
- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/README.md`
- `docs/rbac.md`
- `docs/release-checklist.md`
- `docs/testing.md`
- `docs/observability.md`
- `docs/module-snidane.md`
- `docs/module-ztraty-a-nalezy.md`
- `docs/module-zavady.md`
- `docs/module-sklad.md`
- `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- `apps/kajovo-hotel-web/src/rbac.ts`
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/breakfast.py`
- `apps/kajovo-hotel-api/app/api/routes/lost_found.py`
- `apps/kajovo-hotel-api/app/api/routes/issues.py`
- `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- `apps/kajovo-hotel-api/app/security/auth.py`
- `apps/kajovo-hotel-api/app/security/rbac.py`
- `apps/kajovo-hotel-api/openapi.json`
- `packages/shared/src/rbac.ts`
- `packages/ui/src/shell/AppShell.tsx`
- `packages/ui/src/components/StateView.tsx`
- `apps/kajovo-hotel/ui-tokens/tokens.json`
- `apps/kajovo-hotel/ui-motion/motion.json`
- `apps/kajovo-hotel/palette/palette.json`
- `apps/kajovo-hotel/ux/ia.json`
- `ManifestDesignKájovo.md` pouze jako sekundární zdroj pro Android launcher/adaptive icon pravidla, protože aktivní autorita pro iconografii není v KDGS rozepsána stejně detailně.

Autorita zdrojů pro tento návrh je seřazená takto:
1. KDGS / SSOT.
2. Aktivní current-state dokumenty deklarované v `docs/README.md`.
3. Backend runtime realita a guardy.
4. Ověřené portálové routy a UI chování.
5. Sekundární podpůrné dokumenty bez konfliktu s KDGS.

# 4. Shrnutí skutečně nalezeného scope portálu

Podle auditu a runtime guardů je pro actor type `portal` ověřený tento non-admin scope:
- `/login`
- `/profil`
- `/intro`
- `/offline`
- `/maintenance`
- `/404`
- `/recepce`
- `/pokojska`
- `/snidane`
- role-limitované breakfast podflow `/snidane/nova`, `/snidane/:id`, `/snidane/:id/edit`
- `/ztraty-a-nalezy`
- `/ztraty-a-nalezy/novy`
- `/ztraty-a-nalezy/:id`
- `/ztraty-a-nalezy/:id/edit`
- `/zavady`
- `/zavady/:id`
- `/zavady/:id/edit`
- `/sklad`
- inventory movement flow z listu skladu

Skutečně dohledané user use-cases:
- portal login přes cookie session,
- obnova session přes `/api/auth/me`,
- výběr aktivní role pro multi-role usera,
- update vlastního profilu,
- změna vlastního hesla,
- recepce hub jako rozcestník,
- pokojská quick capture pro závadu nebo nález včetně až 3 fotografií,
- breakfast list a daily summary,
- breakfast servisní režim pro roli `snídaně`,
- breakfast create/detail/edit/import/export pro `recepce`,
- lost-found list/detail/edit/create v user scope,
- issues list/detail/status workflow pro `údržba`,
- inventory list a create movement pro `sklad`.

Scope, který je v repu fyzicky přítomen, ale není ověřený jako legitimní non-admin current-state:
- dashboard `/`
- reports `/hlaseni*`
- inventory detail/create/edit pro non-admin usage
- maintenance issue create

# 5. Role matrix bez adminu

| Role | Ověřená runtime dostupnost | Primární Android home | Povinné Android screeny v1 | Poznámka |
|---|---|---|---|---|
| `recepce` | `breakfast`, `lost_found` | `RecepceHubScreen` | login, role select, recepce hub, breakfast list/detail/create/edit, PDF import preview+confirm, export, lost-found list/detail/create/edit/claim, profil, utility states | V portálu je recepce jediný neadmin breakfast manager. |
| `pokojská` | `housekeeping` | `HousekeepingCaptureScreen` | login, role select, pokojská quick capture, attach až 3 fotografie, success state, profil, utility states | Rychlé založení závady nebo nálezu. |
| `údržba` | `issues` | `IssuesListScreen` | login, role select, issues list, filters, issue detail, status update, profil, utility states | Create závady pro `údržba` není backendem doložené. |
| `snídaně` | `breakfast` | `BreakfastServiceScreen` | login, role select, breakfast service list, day summary, mark served, profil, utility states | V portálu není pro tuto roli doložené create/detail/edit/import. |
| `sklad` | `inventory` | `InventoryListScreen` | login, role select, inventory list, movement form, profil, utility states | Current-state kontrakt je sjednocený jako inventory-only. |

Role switching pravidlo pro Android: autorizace i navigace se mají řídit primárně podle `permissions` z `/api/auth/me` a `active_role`, nikoli pouze podle statické role tabulky v klientu.

# 6. Moduly a use-cases pro Android aplikaci

## V1 moduly

### 6.1 Auth a shell
- Login screen.
- Session restore při cold startu a při návratu aplikace do foregroundu.
- Role selection screen, pokud je `active_role == null` a uživatel má více rolí.
- Role switcher v shellu nebo profilu.
- Profile screen.
- Change-password screen.
- Explicitní logout action v profilu nebo app bar menu.
- Intro / offline / maintenance / not-found screens jako first-class composables.

### 6.2 Recepce
- Recepce hub jako role home.
- Breakfast manager flow:
  - seznam pro zvolené datum,
  - denní souhrn,
  - detail objednávky,
  - vytvoření,
  - editace,
  - editace diet a stavů,
  - PDF import preview + potvrzení,
  - PDF export.
- Lost-found user flow:
  - seznam,
  - filtry,
  - detail,
  - create,
  - edit,
  - změna stavu na `claimed` podle backend guardů,
  - náhledy fotek.

### 6.3 Pokojská
- Quick capture přepínatelný mezi `issue` a `lost_found`.
- Výběr pokoje.
- Krátký popis.
- Přiložení až 3 fotografií.
- Success state a možnost založit nový záznam.

### 6.4 Snídaně
- Servisní list podle dne.
- Day summary.
- Mark served.
- Read-only přehled diet, bez manažerských změn a bez importu.

### 6.5 Údržba
- Issues list.
- Filtry dle priority, stavu, lokality a pokoje.
- Detail závady.
- Timeline a fotky.
- Změna stavu v mezích backend guardů pro `údržba`.

### 6.6 Sklad
- Inventory list bez admin detailu položky.
- Movement create z listového screenu.
- Volba `in | out | adjust`.
- Datum dokladu, reference, poznámka.
- Stav po uložení včetně interního document number, pokud backend vrátí.
## V1 screeny, které jsou povinné bez ohledu na roli
- `LoginScreen`
- `SessionRestoreGate`
- `RoleSelectionScreen`
- `ProfileScreen`
- `ChangePasswordScreen`
- `AccessDeniedScreen`
- `OfflineScreen`
- `MaintenanceScreen`
- `NotFoundScreen`
- `GlobalBlockingErrorScreen`

## Funkce podmíněné backend změnou nebo sign-offem
- In-app reset request z loginu bez admin iniciace.
- Rozšíření non-admin skladu o detail/create/edit položek.
- Reports modul.
- Dashboard pro non-admin.
- Issue create pro `údržba`, pokud má být business scope.

# 7. Co je mimo scope

Mimo scope tohoto návrhu a budoucí Android user app jsou:
- `apps/kajovo-hotel-admin`
- `/uzivatele`
- `/nastaveni`
- admin login, admin logout, admin profil
- `/api/auth/admin/*`
- `/api/v1/users*`
- `/api/v1/admin/profile*`
- `/api/v1/admin/settings/smtp*`
- reports `/hlaseni*`, protože non-admin reachability není ověřená
- dashboard `/`, protože non-admin permission realita jej nepotvrzuje
- inventory detail/create/edit/pictogram/upload/stocktake PDF pro non-admin use
- jakýkoli WebView-first, hybrid wrapper, PWA shell nebo zabalený web
- jakékoli návrhy, které by obcházely KDGS brand, utility state nebo ergonomická pravidla

# 8. Auth, session a role switching model

## 8.1 Login flow
1. Uživatel zadá email a heslo.
2. Android volá `POST /api/auth/login`.
3. Backend vrací server-side session přes cookie `kajovo_session` a CSRF cookie `kajovo_csrf`.
4. Android uloží persistent cookie jar a přejde na `GET /api/auth/me`.
5. Pokud je `actor_type != portal`, přístup je odmítnut.
6. Pokud je `active_role == null` a `roles.length > 1`, otevře se `RoleSelectionScreen`.
7. Jinak se otevře role home.

## 8.2 Session persistence
- Session persistence je možná bez backend změny.
- Android musí umět bezpečně persistovat `kajovo_session` a `kajovo_csrf` mezi spuštěními aplikace.
- Při cold startu se session nikdy nesmí považovat za validní jen podle lokálního stavu. Vždy proběhne `GET /api/auth/me`.
- Pokud `GET /api/auth/me` vrátí `401`, cookie store se smaže a aplikace jde na login.
- Pokud backend vrátí `403` s významem `Active role must be selected`, aplikace jde na role select.
- Session TTL je v backend konfiguraci aktuálně 3600 sekund; Android proto nesmí navrhovat offline-first business zápisy bez nové server validace.

## 8.3 Active role selection
- Android musí podporovat multi-role usera nativně.
- Role selection je server-authoritative, protože aktivní roli nastavuje `POST /api/auth/select-role`.
- Po úspěšném přepnutí role se musí invalidovat UI state a feature cache segmenty navázané na předchozí roli.
- Cache i nav menu se musí segmentovat nejméně podle `userId + activeRole`.

## 8.4 Logout
- Backend `POST /api/auth/logout` je k dispozici.
- Portal UI logout trigger není v auditu doložený jako zřetelný current-state prvek, ale backend endpoint existuje.
- Android v1 má explicitní logout obsahovat, protože session-based native app bez zřejmého logoutu by byla ergonomicky i bezpečnostně slabší.
- Po logoutu je nutné smazat:
  - cookie store,
  - local cache,
  - Room tabulky,
  - DataStore session metadata.

## 8.5 Profile a self-service
- `GET /api/auth/profile` a `PATCH /api/auth/profile` jsou pro Android v1 dostatečné.
- `POST /api/auth/change-password` je doložený a po změně hesla session ukončuje.
- Android po úspěchu nesmí jen ukázat toast. Musí přejít na login a vynutit nové přihlášení.

## 8.6 Password reset návaznost
- Portal login už nenabízí self-service forgot-password request. Current-state text říká, že reset hesla odesílá administrátor ze správy uživatelů.
- Admin vystavuje reset link přes `POST /api/v1/users/{user_id}/password/reset-link`.
- Uživatelské dokončení resetu je veřejně doložené přes `/login/reset?token=...` + `POST /api/auth/reset-password`.
- `POST /api/auth/reset-password` po úspěchu revokuje sessiony a vrací uživatele na login.
- Závěr: Android nemusí v1 nabízet self-service request z loginu, ale může bezpečně podporovat deep-link completion screen pro adminem vydaný reset link.

## 8.7 Route a screen guarding
- Guarding se musí řídit `permissions`, `roles`, `active_role`, `actor_type` a feature-specific server guardy.
- Statická role sama nestačí, protože audit i po nové repo deltě stále potvrzuje drift mezi docs/shared a backendem.
- Praktické pravidlo:
- navigaci a dostupnost modulu určují `permissions` z `/api/auth/me`,
  - detailní akce uvnitř modulu určují kombinace runtime role a server response,
  - při konfliktu vždy vítězí server guard.

# 9. Mapování backend API na Android features

| Android feature | Endpointy | Stav readiness | Poznámka |
|---|---|---|---|
| Login | `POST /api/auth/login` | ready | Cookie session + CSRF model je použitelný i pro native client. |
| Session restore / identity | `GET /api/auth/me` | ready | Klíčový autoritativní zdroj pro role, permissions a actor type. |
| Role selection | `POST /api/auth/select-role` | ready | Nutná CSRF hlavička. |
| Logout | `POST /api/auth/logout` | ready | Backend existuje, Android má přidat explicitní UI trigger. |
| Profil | `GET/PATCH /api/auth/profile` | ready | Vhodné pro self-service profil. |
| Change password | `POST /api/auth/change-password` | ready | Po úspěchu následuje návrat na login. |
| Password reset request | admin-only `POST /api/v1/users/{user_id}/password/reset-link` | out of Android user scope | Request fázi spouští jen admin správa uživatelů, nikoli user login. |
| Password reset completion | `/login/reset` + `POST /api/auth/reset-password` | ready | Deep-link completion flow je nyní forenzně doložený a session po resetu revokuje. |
| Recepce hub | bez extra API, kompoziční screen | ready | Hub s CTA do ztrát a snídaní. |
| Breakfast list | `GET /api/v1/breakfast`, `GET /api/v1/breakfast/daily-summary` | ready | Role-dependent varianty UI. |
| Breakfast create/edit/detail | `POST/PUT/GET /api/v1/breakfast*` | ready for `recepce` | V portálu je manager flow jen pro `recepce` a `admin`. |
| Breakfast import/export | `POST /api/v1/breakfast/import`, `GET /api/v1/breakfast/export/daily` | ready for `recepce` | PDF workflow je doložený v portálu i backendu. |
| Lost-found list/detail | `GET /api/v1/lost-found`, `GET /api/v1/lost-found/{id}` | ready | Recepce read flow. |
| Lost-found create/edit | `POST/PUT /api/v1/lost-found*` | ready | Využívá se i z pokojské quick capture. |
| Lost-found photo upload | `POST /api/v1/lost-found/{id}/photos` | ready | Max 3 fotografie. |
| Issues list/detail | `GET /api/v1/issues`, `GET /api/v1/issues/{id}` | ready | Údržba read flow. |
| Issues update status | `PUT /api/v1/issues/{id}` | ready with role limits | `údržba` má guardované status změny. |
| Issues create from pokojská | `POST /api/v1/issues`, `POST /api/v1/issues/{id}/photos` | ready | Pokojská quick capture. |
| Issues create from údržba | `POST /api/v1/issues` | not ready for role | Backend guard to pro `údržba` neumožňuje. |
| Inventory list | `GET /api/v1/inventory` | ready | Non-admin read flow. |
| Inventory movement | `POST /api/v1/inventory/{item_id}/movements` | ready | Doložený non-admin use-case. |
| Inventory detail/create/edit | `GET/POST/PUT /api/v1/inventory*` | `BACKEND PREREQUISITE` for non-admin | Aktuální runtime je admin-only. |

Zvolený Android feature set má mapovat jen user-scope endpointy. OpenAPI obsahuje širší plochu, ale Android v1 ji nemá přebírat plošně.

# 10. Doporučená Android architektura

## 10.1 Aplikační model
Doporučený model je **single-activity app** s Navigation Compose. Důvod:
- celý ověřený user scope je role-driven a routovaný přes jeden shell,
- login, role select, utility states a feature grafy mají sdílené session a guardy,
- AppShell pattern z webu se přirozeně převádí na jeden top-level scaffold,
- přepnutí role vyžaduje centralizované přeroutování a cache invalidaci.

Více activity model by zbytečně fragmentoval auth, role switching a utility state logiku.

## 10.2 UI technologie
Doporučené UI je **Jetpack Compose**, nikoli Views. Důvod:
- repo již pracuje s design tokeny, utility states a shell-first compositional mentalitou,
- Compose lépe zvládá phone/tablet varianty bez web-like layout driftu,
- KDGS vyžaduje konzistentní tokenizaci, ergonomii a robustní state handling,
- Android v1 nepotřebuje kompatibilitu s legacy XML layouty, protože žádný Android kód v repu zatím není.

## 10.3 Vrstvy
Každý feature modul má mít vnitřně tyto vrstvy:
- `presentation`: composables, state holders, navigation entry, UI models,
- `domain`: use cases a role-aware business pravidla,
- `data`: Retrofit service, DTO, mappery, repository implementace, Room entities pro cache.

## 10.4 DTO -> domain mapování
- DTO nesmí proudit přímo do Compose UI.
- Každý modul má mít explicitní mapper `Dto -> Domain -> UiModel`.
- Důvod: backend i shared frontend mají drift v názvosloví a capability modelu.
- Domain model musí normalizovat:
  - role a permission klíče,
  - enum hodnoty,
  - nullable pole,
  - server timestamps,
  - media reference pathy.

## 10.5 API klient
- Použít Retrofit interface jen pro user-scope endpointy.
- Nepoužívat plošné generování všeho z OpenAPI jako build-time povinnost.
- Důvod: OpenAPI zahrnuje i admin a širší surface, zatímco Android v1 potřebuje jen auditovaný subset.
- OpenAPI zůstane jako kontraktní reference a CI kontrola, ne jako křehká povinná codegen vazba v každém buildu.

## 10.6 Secure storage
- Citlivý session stav ukládat přes platformní Android Keystore wrapper.
- Ne-citlivé preference ukládat přes DataStore.
- Room databáze smí držet jen read-through cache a musí být na logout vyčištěná.
- Session cookies a CSRF token nesmí skončit v běžném SharedPreferences bez šifrování.

## 10.7 Cache a offline strategie
- V1 je **cache-assisted online app**, nikoli offline-first business app.
- Read cache ano.
- Offline write queue ne.
- Důvody:
  - session TTL je krátké,
  - write endpointy jsou role-gated a CSRF-protected,
  - audit nedokládá bezpečný conflict resolution model.

## 10.8 Error handling
Základní error taxonomie:
- `Unauthenticated`
- `RoleSelectionRequired`
- `PermissionDenied`
- `ValidationError`
- `NotFound`
- `Maintenance`
- `Offline`
- `ServerError`
- `UnknownError`

Mapování na UI:
- `401` -> login,
- `403` + active role missing -> role select,
- `403` permission -> access denied,
- `404` -> module-level 404 nebo global 404,
- `503` / maintenance contract -> maintenance screen,
- síťová chyba -> offline nebo retryable error state.

## 10.9 Upload a media workflow
- Pokojská a lost-found flows musí podporovat multipart upload až 3 fotografií.
- Android použije system photo picker, případně SAF fallback.
- Breakfast PDF import použije system document picker omezený na `application/pdf`.
- Inventory pictogram workflow je mimo user scope.

## 10.10 Observability a logging
- Každý request má posílat `x-request-id`, aby bylo možné párovat klientské akce s API logy a audit trail.
- Klientský logger má být interní wrapper nad Logcat bez vendor lock-in SDK v1.
- V1 nemá zavádět externí crash/analytics službu bez governance rozhodnutí, protože repo to jako current-state standard nedokládá.

## 10.11 Testability
- Repositories přes rozhraní.
- Interceptory, cookie store a time provider injektované.
- MockWebServer pro auth/session a role flow integrace.
- Compose UI testy pro utility states a role smoke.

# 11. Doporučená modulární struktura projektu

Doporučená struktura uvnitř `android/`:

```text
android/
  app/
  core/model/
  core/designsystem/
  core/designsystem-tokens/
  core/network/
  core/session/
  core/database/
  core/common/
  core/testing/
  feature/auth/login/
  feature/auth/roles/
  feature/profile/
  feature/utility/
  feature/reception/
  feature/housekeeping/
  feature/breakfast/
  feature/lostfound/
  feature/issues/
  feature/inventory/
  gradle/
  gradle/libs.versions.toml
  settings.gradle.kts
  build.gradle.kts
  gradle.properties
```

## Odpovědnosti modulů
- `app`: aplikace, top-level navigation graph, Hilt app, shell wiring.
- `core/model`: domain modely, permission model, shared enums.
- `core/designsystem`: theme, typography, spacing, StateView ekvivalenty, shell komponenty, brand prvky.
- `core/designsystem-tokens`: Kotlin reprezentace tokenů odvozených z `tokens.json`, `palette.json`, `motion.json`.
- `core/network`: Retrofit, OkHttp, interceptory, cookie jar, request-id, auth/session adapter.
- `core/session`: auth repository, role repository, secure storage wrapper.
- `core/database`: Room cache pro read-only data a offline snapshots.
- `core/testing`: test doubles, fixtures, screenshot helpers, MockWebServer utils.
- `feature/*`: konkrétní uživatelské moduly.

Důležité omezení: Android build musí být samostatný. Žádný povinný Gradle task nesmí pro úspěšný build vyžadovat pnpm install, Node bundling nebo Python backend boot.

# 12. Build compatibility matrix

| Položka | Navržená verze | Status | Kompatibilní s | Proč je to bezpečná volba | Co by hrozilo při agresivnější nebo horší volbě |
|---|---|---|---|---|---|
| Android Studio baseline | Panda 2 \\| 2025.3.2 | verified | AGP 8.12.2, Gradle 8.13, JDK 17 | Stabilní IDE baseline s oficiální compat tabulkou pro novější AGP řady. | Starší IDE může selhávat na syncu a nových AGP DSL; agresivnější canary by zvyšovalo nestabilitu týmu. |
| JDK | 17 | verified | AGP 8.12.2, Gradle 8.13 | AGP 8.x JDK 17 vyžaduje. | JDK 21 by zvýšilo rozdíly mezi CI a lokálem; JDK 11 je nekompatibilní. |
| Gradle wrapper | 8.13 | verified | AGP 8.12.2 | Oficiálně odpovídá AGP 8.12. | Nižší Gradle rozbije AGP; vyšší bez ověření zvyšuje riziko plugin driftu. |
| Android Gradle Plugin | 8.12.2 | verified | Gradle 8.13, JDK 17, compileSdk 35 | Ověřená stabilní řada s podporou až API 36, přitom zůstává konzervativní. | AGP 8.13/9.x by přinesl více migračních rizik bez přínosu pro tento scope. |
| Kotlin | 2.2.20 | conservative | Compose plugin 2.2.20, KSP 2.2.20-2.0.4, Dagger 2.57.2 | Stabilní 2.2 linie, není to nejnovější agresivní patch. | Kotlin 2.3.x by otevřel nové compatibility posuny v KSP, Detekt a Hilt. |
| Compose compiler plugin | 2.2.20 | verified | Kotlin 2.2.20, Compose BOM 2026.02.01 | Od Kotlin 2.x je Compose compiler plugin stejné verze jako Kotlin. | Mismatch pluginu a Kotlinu vede k build chybám a nepředvídatelnému Compose chování. |
| Compose BOM | 2026.02.01 | conservative | Compose UI stack, ui-test-junit4 | Stabilní BOM drží Compose artefakty ve vzájemně kompatibilní sadě. | Ruční mix Compose verzí výrazně zvyšuje riziko ABI a preview problémů. |
| compileSdk | 35 | conservative | AGP 8.12.2, targetSdk 35 | Opatrná enterprise volba, plně dostačující pro v1. | compileSdk 36 by zvyšoval churn bez doloženého business přínosu. |
| targetSdk | 35 | conservative | compileSdk 35 | Bezpečný současný cíl bez zbytečně agresivního posunu. | Nižší target může brzdit distribuci; vyšší bez QA rozšíří behavior změny. |
| minSdk | 26 | conservative | Compose, OkHttp 5, modern storage a picker fallbacky | Snižuje QA matici a stále pokrývá moderní zařízení pro provozní staff app. | Nižší minSdk prodraží testy, kompatibilitu a storage/auth edge casy. |
| KSP | 2.2.20-2.0.4 | conservative | Kotlin 2.2.20, Room 2.8.1, Moshi codegen | Konzervativní pin odpovídající Kotlin 2.2.20. | KSP 2.3.x by přitáhlo další toolchain migraci; KSP1 je na ústupu. |
| Hilt / Dagger | 2.57.2 | conservative | Kotlin 2.2.x, KSP, AndroidX Hilt 1.3.0 | Ověřená stabilní verze s explicitním fixem pro Kotlin 2.2 podporu. | Agresivnější pin bez lokálního ověření by mohl přinést Hilt plugin drift. |
| AndroidX Hilt Compose | 1.3.0 | verified | Hilt 2.57.2, Compose | Aktuální stabilní AndroidX vrstva pro Hilt + Compose. | Starší verze mají starší API umístění a horší Compose ergonomii. |
| Room | 2.8.1 | conservative | KSP, Kotlin 2.2.20 | Stabilní databázová vrstva pro role-segmentovanou cache. | Starší Room zhorší KSP a schema export workflow; agresivnější bez důvodu nepřináší hodnotu. |
| Coroutines | 1.10.2 | conservative | Kotlin 2.2.20, Lifecycle 2.10.0 | Stabilní asynchronní základ. | Starší verze zhorší structured concurrency API a test support. |
| Lifecycle | 2.10.0 | verified | Compose, Activity, Navigation | Stabilní lifecycle stack pro Compose state holders. | Starší verze snižují kompatibilitu s novějším Activity stackem. |
| Activity Compose | 1.12.4 | conservative | Compose 1.10.x, Lifecycle 2.10.0 | Stabilní activity bridge bez přechodu na úplně novou 1.13 řadu. | Agresivnější řada by mohla přidat chování, která nejsou v týmu ověřená. |
| Navigation Compose | 2.9.7 | verified | Activity 1.12.x, Compose 1.10.x | Stabilní navigační vrstva vhodná pro single-activity shell. | Starší navigace hůře podporuje moderní Compose patterny. |
| Retrofit | 3.0.0 | conservative | OkHttp 5.x, Moshi converter | Stabilní major s forward binární kompatibilitou z 2.x linie. | Ruční HTTP bez typed service by zhoršil testovatelnost; starší retrofit nepřináší výhodu. |
| OkHttp BOM | 5.3.0 | conservative | Retrofit 3.0.0, MockWebServer 5.3.0 | Jedna BOM drží runtime i test server ve stejné řadě. | Mix 4.x/5.x by přinesl zbytečné runtime odchylky. |
| Moshi | 1.15.2 | conservative | Retrofit converter, KSP codegen | Ověřená a rozšířená JSON vrstva s codegen variantou. | Přímé DTO bez codegen/reflection strategie by zvedly runtime chyby a R8 rizika. |
| WorkManager | 2.11.1 | verified | compileSdk 35, minSdk 26 | Vhodný pro neurgentní housekeeping práce, ne pro business write queue. | Starší WorkManager má méně oprav; agresivnější bez přínosu není nutný. |
| DataStore | 1.2.0 | conservative | minSdk 26, Kotlin coroutines | Bezpečná preference storage vrstva pro ne-citlivé app preference. | 1.2.1 je příliš čerstvá pro základní pin; SharedPreferences by byly slabší. |
| Secure storage | Android Keystore API 26+ | conservative | minSdk 26, DataStore | Nezavádí deprecated bridge jako primární řešení. | Běžné preferences nebo nešifrovaný cookie store jsou bezpečnostně nepřijatelné. |
| Coil | 3.3.0 | conservative | Compose, OkHttp 5 | Stabilní image stack pro thumbnaily z backendu. | Příliš nová verze může měnit chování bez nutnosti; ruční image loading zhorší UX. |
| JUnit | 4.13.2 | conservative | Android unit tests, MockWebServer | Široce kompatibilní základ pro lokální testy. | Unifikace na JUnit5 by přidala další vrstvu konfigurace bez kritické potřeby. |
| AndroidX Test core/runner/rules/ext.junit | 1.7.0 / 1.7.0 / 1.7.0 / 1.3.0 | verified | API 21+, emulator tests | Stabilní instrumentační baseline. | Starší test stack zhoršuje Compose UI test spolehlivost. |
| Compose UI Test | přes Compose BOM 2026.02.01 | verified | Compose 1.10.x | Drží UI test knihovny ve stejné Compose sadě. | Ruční pin mimo BOM zvyšuje riziko mismatch. |
| MockWebServer | 5.3.0 | conservative | OkHttp 5.3.0 | Ideální pro auth/cookie/CSRF a edge-case integrace. | Nesjednocené verze s OkHttp BOM komplikují test runtime. |
| Android Lint | bundled with AGP 8.12.2 | verified | AGP 8.12.2 | Základní statická kontrola bez dalšího pluginového driftu. | Přeskočení lintu by šlo proti release gate kultuře repa. |

# 13. Doporučené verze všech klíčových závislostí

## Toolchain
- Android Studio: `Panda 2 | 2025.3.2`
- JDK: `17`
- Gradle Wrapper: `8.13`
- Android Gradle Plugin: `8.12.2`
- Kotlin: `2.2.20`
- Compose compiler plugin: `2.2.20`
- KSP: `2.2.20-2.0.4`

## Android platform
- compileSdk: `35`
- targetSdk: `35`
- minSdk: `26`

## UI a app shell
- Compose BOM: `2026.02.01`
- Activity Compose: `1.12.4`
- Lifecycle: `2.10.0`
- Navigation Compose: `2.9.7`
- Coil: `3.3.0`

## DI, persistence, concurrency
- Dagger / Hilt: `2.57.2`
- AndroidX Hilt Compose: `1.3.0`
- Room: `2.8.1`
- Coroutines: `1.10.2`
- WorkManager: `2.11.1`
- DataStore: `1.2.0`
- Secure storage: `Android Keystore API 26+`

## Networking a serializace
- Retrofit: `3.0.0`
- OkHttp BOM: `5.3.0`
- Moshi: `1.15.2`
- Moshi codegen: `1.15.2`
- Retrofit converter Moshi: `3.0.0`

## Testy a quality gates
- JUnit: `4.13.2`
- AndroidX Test Core: `1.7.0`
- AndroidX Test Runner: `1.7.0`
- AndroidX Test Rules: `1.7.0`
- AndroidX Test Ext JUnit: `1.3.0`
- Espresso: `3.7.0`
- Compose UI Test: přes Compose BOM `2026.02.01`
- MockWebServer: `5.3.0`
- Android Lint: bundled with AGP `8.12.2`

## Záměrně nezařazené jako baseline
- Detekt a ktlint nejsou baseline blokující dependency pro první zavedení Android subtree. Důvodem je snaha minimalizovat současné kompatibilitní napětí mezi Kotlin 2.2.x, AGP 8.12.x a externími lint pluginy. Baseline quality gate v1 tvoří Android Lint, unit testy, UI testy a role smoke.

# 14. Zdůvodnění verzí a kompilovatelnosti

## 14.1 Proč je tato sada kompilovatelná
Navržená sada je konzervativní a drží jeden jasný řetězec kompatibility:
- Android Studio Panda 2
- JDK 17
- Gradle 8.13
- AGP 8.12.2
- Kotlin 2.2.20
- Compose compiler plugin 2.2.20
- KSP 2.2.20-2.0.4

Tento řetězec je zvolen proto, aby nevyžadoval experimentální canary pluginy ani nejnovější Kotlin 2.3 větev. Compose je řízené BOM, takže UI artefakty nejsou pinované ručně po jednotlivých modulech.

## 14.2 Proč není vhodná agresivnější volba
Agresivnější volby by zde byly technicky zbytečné:
- AGP 8.13 nebo 9.x nepřináší pro tento scope zásadní hodnotu.
- Kotlin 2.3.x by tlačil další upgrade KSP, detekt a případně Hilt pluginu.
- compose/artifact mix mimo BOM by zvyšoval riziko build a preview driftu.

## 14.3 Proč není vhodná slabší volba
Příliš staré verze by zde škodily také:
- starší AGP a Gradle by zhoršily dlouhodobou podporu,
- starší Kotlin by zhoršil Compose a KSP kompatibilitu,
- starší Navigation/Lifecycle stack by zvyšoval množství workaroundů v single-activity appce.

## 14.4 Jak zabránit build stack kolapsu
Toto je kritická součást návrhu.

Android subtree musí být oddělený od stávajícího web/backend buildu:
- vlastní `settings.gradle.kts`,
- vlastní `gradlew`,
- vlastní version catalog,
- žádná povinná gradle task závislost na `pnpm install`, `vite build` nebo `pytest`.

Tokeny, palette a motion se mají do Androidu propsat takto:
- jako checked-in Kotlin token modul odvozený z existujících JSON souborů,
- nebo jako řízený jednorázový sync step v CI, nikoli jako povinná runtime/build-time dependency na Node.

Stejná logika platí pro API vrstvu:
- Android nemá při každém buildu generovat vše z OpenAPI přes externí CLI.
- Pro v1 je bezpečnější udržovat ručně psaný user-scope Retrofit surface, protože scope je auditovaně úzký a route-level guardy jsou jemnější než samotná OpenAPI plocha.

# 15. UI/UX a KDGS compliance mapování

## 15.1 Čistě nativní Android model
Návrh je čistě nativní:
- Kotlin,
- Jetpack Compose,
- Navigation Compose,
- nativní storage,
- nativní photo/document picker,
- žádný WebView shell.

## 15.2 Brand prvek v každém view
KDGS vyžaduje minimálně jeden platný brand prvek na každém view.

Navržené pravidlo:
- login a intro: `Full Lockup` jako hlavní brand prvek,
- běžné app shell screeny: `Wordmark` v top app baru + `Signace` fixed vlevo dole,
- maximálně 2 brand prvky na view,
- utility states: `Signace` nebo `Full Lockup` podle hustoty layoutu.

## 15.3 Launcher icon a adaptive icon pravidla
Tato část vychází sekundárně z `ManifestDesignKájovo.md`, protože audit nedoložil detailnější současný Android icon standard jinde.

Pravidlo:
- launcher icon používá `MARK` bez signace,
- adaptive icon foreground = `MARK`,
- adaptive icon background = neutrální `#FFFFFF` nebo `#EEEEEE`,
- nepoužívat `#FF0000` jako dominantní background ikony,
- dark mode nesmí měnit samotný brand asset.

## 15.4 Typografie
- UI font: Montserrat.
- Váhy: regular 400, bold 700.
- Velikosti a line-height se mají odvodit z `tokens.json`.
- Brand assety se nepřekreslují systémovým fontem.

## 15.5 Tokeny
Android design system musí respektovat existující tokeny:
- grid `8pt`,
- spacing `s0` až `s10`,
- radius `r0/r8/r12/r16`,
- elevation `e0-e3`,
- focus ring šířka `2`,
- signage positioning a z-index pravidla,
- paletu s tím, že brand red je rezervovaný pro signaci a není obecné primary CTA.

## 15.6 Spacing, radius, elevation, motion
- veškerý layout je násobek 8 dp,
- touch target minimum 44 x 44 dp,
- elevation jen dle tokenů,
- motion jen dle tokenů,
- reduced motion musí vypnout parallax, bouncy a auto scrolling ekvivalenty.

## 15.7 WCAG 2.2 AA minimum
- kontrast a state barvy se musí ověřovat vůči tokenům,
- všechny focusable prvky musí mít viditelný focus indicator,
- screen reader texty pro ikony, fotky a file pickery musí být explicitní,
- error messages a success states mají mít srozumitelné texty, ne jen barvu.

## 15.8 Dark mode bez deformace brand assetů
- dark mode je podporovaný,
- signace zůstává `#FF0000 + #FFFFFF`, neinvertuje se,
- brand red se dál nepoužívá jako primární výplň běžných tlačítek,
- pozadí a container barvy se mapují z neutrální palety, nikoli přes automatickou inverzi assetů.

## 15.9 Povinné stavy a zákaz layoutových rozpadů
Každý screen musí mít:
- default,
- loading,
- empty,
- error,
- offline nebo maintenance podle typu selhání,
- 404/fallback, pokud pracuje s detail route.

A zároveň:
- žádný neřízený horizontální overflow,
- žádné useknuté CTA,
- žádné rozpadlé formy při font scalingu,
- žádná kolize bottom signace s CTA nebo systémovými gesty.

## 15.10 Ergonomie a telefon/tablet robustnost
- Phone: bottom navigation nebo role-home-first shell, primary akce v dosahu palce.
- Tablet: navigation rail + content pane nebo master/detail tam, kde dává smysl.
- Široké tabulky z webu se na telefonu nesmí kopírovat 1:1; musí se převést do card/list patternu, aby nevznikal overflow.

# 16. Povinné stavy obrazovek

Povinné stavy pro Android v1:

## Globální
- splash/session restore
- login idle
- login submitting
- login invalid credentials
- login offline
- role selection loading
- role selection error
- maintenance
- offline
- not found
- access denied

## Profil
- profile loading
- profile loaded
- profile save success
- profile validation error
- change password loading
- change password success -> forced login
- profile offline/error

## Recepce hub
- default hub
- loading metrics placeholder není povinný, protože hub je statický CTA screen
- action error pouze při navigační nebo session chybě

## Snídaně
- list loading
- empty day
- list loaded
- import preview loading
- import preview empty
- import preview loaded
- import save success
- export action state
- detail 404
- form validation error
- form submit success/error

## Ztráty a nálezy
- list loading
- list empty
- list error
- detail loading
- detail loaded
- detail 404
- create/edit validation error
- create/edit success
- upload photo error

## Závady
- list loading
- list empty
- list error
- detail loading
- detail loaded
- detail 404
- status update success/error
- upload photo error pro pokojská flow

## Pokojská quick capture
- idle
- room missing validation error
- description missing validation error
- too many photos error
- submit loading
- success
- submit error

## Sklad
- inventory loading
- inventory empty
- inventory list loaded
- movement validation error
- movement submit loading
- movement submit success
- movement submit error

# 17. A11y, dark mode, reduced motion, ergonomie

## A11y
- Všechny interaktivní prvky minimálně 44 x 44 dp.
- TalkBack label pro:
  - role switcher,
  - photo picker,
  - import PDF,
  - status badges,
  - image thumbnails.
- Error state musí být sémanticky oznámený, ne jen barevně odlišený.
- Utility state composables mají používat vhodné heading hierarchy a live region ekvivalent.

## Dark mode
- Podpora dark mode je povinná.
- Brand assety se nemění ani neinvertují.
- Signace zůstává červenobílá.
- Na tmavém pozadí je třeba zajistit dostatečný kontrast okolních containerů a textu.

## Reduced motion
- Skeletony a přechody respektují systémové nastavení reduced motion.
- Žádné automatické scrollování do elementů bez uživatelské iniciace.
- Žádné dekorativní animace bez informační funkce.

## Ergonomie
- Formuláře a quick capture musí jít ovládat jednou rukou na telefonu.
- Bottom signace nesmí kolidovat s FAB, bottom bar ani IME.
- Foto flow musí být krátký: vybrat pokoj -> popis -> připojit foto -> odeslat.
- Breakfast servisní role `snídaně` musí mít extra rychlý tap target pro `Vydáno`.

# 18. Offline a chybové scénáře

## Strategie
V1 není offline-first. V1 je online-first s read cache.

## Co se ukládá lokálně
- poslední úspěšné seznamy a detail snapshoty pro user moduly,
- session metadata,
- ne-citlivé preference,
- nic z toho se nesmí považovat za autoritativní bez nové server validace.

## Co se neukládá jako pending queue
- create/update/delete pro breakfast,
- create/update pro lost-found,
- issue status update,
- inventory movement,
- photo upload.

## Proč ne queue
- krátká session životnost,
- CSRF nutnost,
- role switching mění scope dat,
- repo nedokládá conflict resolution model.

## Chování při offline
- read screens mohou ukázat poslední cache jako `stale`, pokud existuje,
- write akce se nefrontují, ale odmítnou s explicitní informací a CTA `Zkusit znovu po připojení`,
- pokud cache neexistuje, použije se global offline state.

## Chování při maintenance
- server maintenance se mapuje na samostatný maintenance screen, nikoli na generický toast.

## Chování při 404
- detail screen přejde na modulový 404 state s návratem na list.

# 19. Test strategy

## 19.1 Unit testy
Povinné unit testy pro:
- role/permission resolver,
- auth/session reducer,
- DTO -> domain mappery,
- error mapper,
- inventory movement validation,
- breakfast state transitions v UI modelu,
- profile update a logout side effecty.

## 19.2 Integration testy s MockWebServer
Povinné integrační testy pro:
- login + cookie persistence,
- `GET /api/auth/me` bootstrap,
- CSRF header injection,
- role selection,
- logout cache wipe,
- change-password -> forced login,
- multipart upload pro pokojská flow,
- inventory movement request model,
- permission denied mapping.

## 19.3 Compose UI testy
Povinné UI testy pro:
- login screen,
- role select screen,
- utility states,
- recepce hub,
- pokojská quick capture,
- breakfast service flow,
- issue detail status flow,
- inventory movement flow,
- profile edit.

## 19.4 Role smoke scénáře
Minimální smoke sada před releasem:
- `recepce`: login -> role select -> breakfast list -> import preview -> lost-found edit,
- `pokojská`: login -> quick capture issue s fotkou,
- `údržba`: login -> issues list -> detail -> status update,
- `snídaně`: login -> breakfast service -> mark served,
- `sklad`: login -> inventory movement.

## 19.5 Visual robustness
Protože repo už pracuje s vizuálními release gates, Android musí aspoň na úrovni CI a QA ověřovat:
- phone width kolem 390 dp,
- tablet width kolem 820 dp,
- velkou width variantu bez overflow a bez kolizí signace.

# 20. CI/CD a release gates pro Android

## 20.1 Doporučené CI kroky
Samostatný Android workflow v `.github/workflows/` má spouštět minimálně:
- checkout,
- JDK 17 setup,
- Gradle cache,
- `./gradlew lintDebug`,
- `./gradlew testDebugUnitTest`,
- `./gradlew :app:assembleDebug`,
- `./gradlew :app:assembleRelease`,
- `./gradlew connectedDebugAndroidTest` na emulátoru minimálně nightly nebo před release kandidátem,
- kontraktní kontrolu proti `apps/kajovo-hotel-api/openapi.json`, že user-scope endpointy se nezměnily bez review.

## 20.2 Release gates pro Android
Android release nesmí projít, pokud:
- nebyl zvednut `versionCode` a `versionName` v `android/app/build.gradle.kts`,
- nebyla zvednuta backend metadata verze v `apps/kajovo-hotel-api/app/config.py`,
- veřejná APK `apps/kajovo-hotel-web/public/downloads/kajovo-hotel-android.apk` neodpovídá právě vydané verzi,
- produkční endpoint `/api/app/android-release` nehlásí stejnou verzi jako produkční APK,
- chybí brand prvek na view,
- chybí utility state coverage,
- je nalezen horizontální overflow nebo cut-off CTA,
- role smoke neprojde,
- logout nevyčistí session a cache,
- permission denied vede na špatný screen,
- offline/maintenance/404 nejsou first-class states,
- breakfast, lost-found, issues nebo inventory flow selže na core use-case.

## 20.3 Definition of Done
Feature je hotová jen pokud:
- je v souladu s auditovaným scope,
- je role-guarded podle runtime permissions,
- má loading/empty/error/offline/404 variantu podle potřeby,
- má unit testy a minimálně jeden integration nebo UI test,
- u release kandidáta je zvednutá Android verze, backend metadata verze a publikovaná veřejná APK ve stejném releasu,
- nepřidává admin scope,
- respektuje KDGS brand, spacing, typography a ergonomii,
- nevyžaduje WebView nebo hybrid fallback.

# 21. Rizika, mezery a otevřené otázky

## RISK: route-level guard drift
- Samotná role-module mapa nestačí. Route-level guardy jsou v některých modulech jemnější než základní RBAC matice.
- Týká se to hlavně `breakfast`, `issues` a `inventory`, kde ne každá write permission znamená plný CRUD scope.
- Dopad: Android navigace i akce musí být postavené na `/api/auth/me` a následně respektovat konkrétní server response.

## RISK: feature drift mezi portal UI a backendem
- breakfast bulk akce, inventory non-admin reachability a reports/dashboard přítomnost v kódu nejsou stejné jako runtime permission realita.
- Dopad: Android nesmí slepě replikovat všechny web route definice.

## RISK: session model je cookie-first, ne mobile-first
- Model je použitelný, ale vyžaduje precizní správu cookie jar a CSRF.
- Dopad: více testování auth edge cases.

## GAP: reset request UX parity
- Current-state portál už nenabízí self-service request resetu z loginu. Pokud by business chtěl request i completion plně uvnitř Android appky, šlo by o nové scope rozhodnutí nad rámec dnešního portálu.

## GAP: logout UX parity
- Backend logout existuje, ale portálový logout trigger není v auditu prominentně doložený jako current-state UX.
- Android musí tento UX doplnit.

## GAP: Android-specific asset pack
- Repo nedodává hotový Android launcher asset set ani Android-specific splash asset manifest.
- Brand pravidla existují, asset packaging pro Android bude třeba připravit.

## Otevřené otázky, které neblokují start implementace
- Má recepce v Android v1 dostat i breakfast import/export hned v první releasované verzi, nebo až ve druhé fázi po stabilizaci auth/session testů?
- Má se tablet varianta řešit jako master/detail jen pro vybrané moduly (`issues`, `lost_found`, `inventory`), nebo jednotně přes single-pane + side sheet?

# 22. Blockers

Aktuálně není evidován otevřený blocker, který by bránil přípravě Android user app scope podle dnešní runtime pravdy.

## BACKEND PREREQUISITE mimo v1 scope
Pokud by business požadoval do Androidu navíc:
- inventory detail/create/edit pro non-admin,
- reports,
- dashboard,
pak je nutná backend změna nebo kontraktní doplnění.

# 23. Doporučené pořadí implementace po fázích

## Fáze 0 — kontrakt a skeleton bez feature parity
- založit samostatný Android subtree,
- zafixovat build matrix,
- přenést tokeny/paletu/motion do Android design systemu,
- založit auth/session infrastrukturu,
- vytvořit utility states a app shell,
- zavést CI build + lint + unit.

## Fáze 1 — auth a shared shell
- login,
- session restore,
- role select,
- logout,
- profile,
- change-password,
- role-aware navigation,
- offline/maintenance/404.

## Fáze 2 — provozní moduly s nejnižším rizikem
- pokojská quick capture,
- issues list/detail/status,
- inventory list + movement,
- breakfast service list pro `snídaně`.

## Fáze 3 — recepční parity
- recepce hub,
- breakfast manager create/detail/edit,
- breakfast import/export,
- lost-found list/detail/create/edit.

## Fáze 4 — stabilizace a tablet robustness
- tablet layout refinements,
- cache segmentation hardening,
- screenshot/visual gates,
- overflow a font scaling audit,
- release candidate smoke matrix.

## Fáze 5 — po stabilizaci základního scope
- případné rozšíření scope po provozním ověření,
- rozhodnutí, zda Android přidá i deep-link reset completion screen v první produkční verzi nebo až po auth stabilizaci,
- případné doplnění dalších modulů jen pokud je backend a audit legitimně otevřou.

# 24. Finální verdikt realizovatelnosti

**Verdikt: realizovatelné bez aktuálního kontraktového blockeru.**

Tento návrh je technicky platný a kompilovatelný jako samostatný nativní Android projekt, pokud se dodrží tyto podmínky:
- scope zůstane omezený na auditovanou user část,
- build zůstane oddělený od pnpm/Python stacku,
- navigace a guarding budou řízené přes `/api/auth/me` runtime truth,
- design system převezme KDGS tokeny a brand pravidla bez web wrapper kompromisů,
- release gates budou obsahovat utility states, role smoke a overflow/ergonomii.

Z pohledu implementační připravenosti lze začít ihned s Fází 0 a Fází 1. Auth/reset blocker je v této repo revizi odstraněný a RBAC kontrakt je pro dnešní scope srovnaný. Definitivní production scope sign-off proto dnes stojí hlavně na business rozhodnutí o rozsahu Android v1, ne na otevřeném driftu mezi backendem, shared vrstvou a dokumentací.
# Archivní poznámka

Tento dokument je historický architektonický a delivery materiál.
Aktivní current-state provozní dokumentace Androidu je `android/README_ANDROID.md`.
Při konfliktu má přednost current-state README a reálný kód.
