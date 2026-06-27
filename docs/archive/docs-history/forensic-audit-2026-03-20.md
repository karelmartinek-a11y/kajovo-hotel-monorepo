# Forenzní A Binární Audit Webu A Androidu

Datum auditu: 2026-03-20  
Repo: `C:\GitHub\kajovo-hotel-monorepo`  
Auditovaný pár: `apps/kajovo-hotel-web` vs `android/`

## 1. Zadání a metoda

Tento audit porovnává skutečně implementované pohledy, workflow, texty, stavy, CTA, role guardy a kosmetickou vrstvu mezi webovým portálem a nativní Android aplikací. Nejde jen o hlavní seznamy, ale i o:

- login a role select,
- utility stavy,
- detail/form/edit parity,
- fotky, importy, exporty, filtry a vedlejší akce,
- branding, shell, navigační chroma a mikrocopy,
- plochy, které jsou v jedné platformě přítomné a v druhé úplně chybí.

Audit je forenzní:

- vychází přímo z implementace v kódu,
- rozlišuje „existuje v routě“ vs „je opravdu zpracované jako samostatný screen“,
- rozlišuje plnou paritu, částečnou paritu a nepřítomnost.

Audit je binární:

- u každého view a capability je uvedeno, zda je na webu a v Androidu `ANO/NE`,
- navíc je uvedeno, zda jde o `PLNÁ`, `ČÁSTEČNÁ` nebo `ŽÁDNÁ` parita.

## 2. Auditované zdroje

Primární zdroje:

- `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- `apps/kajovo-hotel-web/src/routes/utilityStates.tsx`
- `apps/kajovo-hotel-web/src/main.tsx`
- `packages/ui/src/shell/AppShell.tsx`
- `android/app/src/main/java/cz/hcasc/kajovohotel/app/KajovoHotelApp.kt`
- `android/feature/auth/login/.../LoginScreen.kt`
- `android/feature/auth/roles/.../RoleSelectionScreen.kt`
- `android/feature/reception/.../ReceptionHubScreen.kt`
- `android/feature/housekeeping/.../HousekeepingScreen.kt`
- `android/feature/breakfast/.../BreakfastScreen.kt`
- `android/feature/lostfound/.../LostFoundScreen.kt`
- `android/feature/issues/.../IssuesScreen.kt`
- `android/feature/inventory/.../InventoryScreen.kt`
- `android/feature/profile/.../ProfileScreens.kt`
- `android/feature/utility/.../UtilityScreens.kt`
- `android/core/designsystem/.../Components.kt`
- `android/core/designsystem/.../KajovoTheme.kt`

Sekundární zdroje:

- `android/KajovoHotelAndroid.md`
- `android/KajovoHotelAndroid.audit.md`
- `apps/kajovo-hotel/ux/ia.json`

## 3. Exekutivní závěr

Android aplikace není feature-paritní klon webu. Je to zúžená a zhuštěná nativní interpretace portálového scope.

Hlavní verdikt:

- shell, utility stavy, role switching, housekeeping, breakfast, lost-found, issues, inventory a profil existují na obou platformách,
- Android často slučuje `list + detail + edit + create` do jednoho composable flow, zatímco web má oddělené routy,
- Android na několika místech deklaruje větší scope, než jaký má web reálně rozdělený do view, ale ve skutečnosti dává méně samostatných obrazovek,
- web má širší povrch v routách: `dashboard`, `reports`, samostatné detail/edit/create obrazovky a detailnější utility texty,
- Android má naopak několik nativních doplňků, které web nemá jako samostatný UX prvek:
  - explicitní logout v chromu,
  - update prompt před loginem,
  - nativní reset hesla v aplikaci,
  - nyní i trvalé ukládání nově vyfocené housekeeping fotky do zařízení.

Z kosmetického hlediska:

- web je vizuálně bohatší, textově přesnější a má výrazně propracovanější utility a login copy,
- Android je jednotnější, ale generičtější; často používá technické nebo interně znějící titulky typu „FeatureCard“, „Role-driven shell“, „Nativní Android start“,
- branding je přítomen na obou stranách, ale web má silnější wordmark/shell/signage kompozici, zatímco Android staví hlavně na badge, top baru a footeru.

## 4. Binární Matice View Parity

| View / modul | Web | Android | Parita | Poznámka |
|---|---|---|---|---|
| Login | ANO | ANO | ČÁSTEČNÁ | Web má wordmark, APK download a admin-init reset copy; Android má remember-me a nativní branding. |
| Reset hesla | ANO | ANO | ČÁSTEČNÁ | Web má samostatnou veřejnou route, Android in-app screen před autentizací. |
| Role select | ANO | ANO | ČÁSTEČNÁ | Web tlačítka „pokračovat jako“, Android radio + potvrzení. |
| Access denied | ANO | ANO | ČÁSTEČNÁ | Web uvádí modul, roli a user id; Android jen obecné odmítnutí. |
| Intro | ANO | ANO | ČÁSTEČNÁ | Web je marketingově a brandově bohatší, Android je krátký blocking stav. |
| Offline | ANO | ANO | ČÁSTEČNÁ | Web má 2 recovery akce, Android 1. |
| Maintenance | ANO | ANO | ČÁSTEČNÁ | Web je bohatší na copy a navigaci. |
| Not found | ANO | ANO | ČÁSTEČNÁ | Web je kontextový k portálu, Android je stručný fallback. |
| Recepce hub | ANO | ANO | ČÁSTEČNÁ | Android pouze 2 klikatelné karty, web používá `StateView` s detailnější copy. |
| Pokojská quick capture | ANO | ANO | ČÁSTEČNÁ | Android je nativnější, web má separátní galerii/kameru, Android lokálně ukládá vyfocený snímek. |
| Snídaně list | ANO | ANO | ČÁSTEČNÁ | Android slučuje manager i service flow do jednoho screenu. |
| Snídaně detail | ANO | NE jako samostatný view | ŽÁDNÁ | Android detail neodděluje routou, jen výběrem v jednom screenu. |
| Snídaně create | ANO | ANO | ČÁSTEČNÁ | Android create je inline editor, ne samostatná obrazovka. |
| Snídaně edit | ANO | ANO | ČÁSTEČNÁ | Android edit je inline editor. |
| Snídaně import preview | ANO | ANO | ČÁSTEČNÁ | Android opakuje výběr PDF při potvrzení, web má klasický webový flow. |
| Snídaně export | ANO | ANO | ČÁSTEČNÁ | Oba mají export, ale jiný UX povrch. |
| Lost-found list | ANO | ANO | ČÁSTEČNÁ | Android list + detail + editor v jednom flow. |
| Lost-found detail | ANO | ANO | ČÁSTEČNÁ | Android detail není samostatný screen, ale selected card/editor. |
| Lost-found create | ANO | ANO | ČÁSTEČNÁ | Android inline editor. |
| Lost-found edit | ANO | ANO | ČÁSTEČNÁ | Android inline editor. |
| Lost-found photo picker | ANO | ANO | ČÁSTEČNÁ | Web i Android podporují max 3 fotky; Android nemá samostatné „vyfotit“ v lost-found, jen picker. |
| Issues list | ANO | ANO | ČÁSTEČNÁ | Android tvrdí i create/edit v jednom screenu. |
| Issues detail | ANO | ANO | ČÁSTEČNÁ | Android detail je inline selected issue. |
| Issues create | ANO | ANO | ČÁSTEČNÁ | Android inline editor. |
| Issues edit | ANO | ANO | ČÁSTEČNÁ | Android inline editor. |
| Issues photo gallery | ANO | ANO | ČÁSTEČNÁ | Android jen náhledy selected issue, bez samostatného detailu fotek. |
| Inventory list | ANO | ANO | ČÁSTEČNÁ | Android je výrazně zúžený na movement + list. |
| Inventory movement form | ANO | ANO | PLNÁ | Funkčně nejbližší parita. |
| Inventory detail | ANO | NE jako samostatný view | ŽÁDNÁ | Web detail existuje, Android ne. |
| Inventory create | ANO | NE | ŽÁDNÁ | Web admin/create route existuje, Android ne. |
| Inventory edit | ANO | NE | ŽÁDNÁ | Web admin/edit route existuje, Android ne. |
| Reports list | ANO | NE | ŽÁDNÁ | Android reports modul chybí. |
| Reports detail | ANO | NE | ŽÁDNÁ | Android reports modul chybí. |
| Reports create/edit | ANO | NE | ŽÁDNÁ | Android reports modul chybí. |
| Dashboard | ANO v kódu | NE | ŽÁDNÁ | Android dashboard nemá; i webový dashboard je mimo běžný non-admin runtime scope. |
| Profil | ANO | ANO | ČÁSTEČNÁ | Web má plnější formulář včetně poznámky; Android je zúžený. |
| Změna hesla | ANO | ANO | ČÁSTEČNÁ | Android copy je kvalitní, ale samostatný screen je jednodušší než webový formulář v portálu. |
| Logout trigger | NE jako zjevný portal UX prvek | ANO | ŽÁDNÁ | Android má explicitní `Odhlásit` v chromu. |
| App update prompt | NE | ANO | ŽÁDNÁ | Android-only. |

## 5. Binární Matice Capability Parity

| Capability | Web | Android | Parita | Poznámka |
|---|---|---|---|---|
| Wordmark na loginu | ANO | NE | ŽÁDNÁ | Android používá signage badge, ne wordmark. |
| APK download CTA | ANO | NE | ŽÁDNÁ | Web login nabízí stažení APK. |
| Remember me | NE | ANO | ŽÁDNÁ | Android-only checkbox. |
| Explicitní logout | NE zjevně | ANO | ŽÁDNÁ | Android má pevné CTA v top baru. |
| Role switch v shellu | ANO | ANO | PLNÁ | Obě platformy to mají v chrome. |
| Utility recovery CTA > 1 | ANO | NE | ČÁSTEČNÁ | Web má bohatší utility recovery. |
| Housekeeping galerie | ANO | ANO | PLNÁ | Obě platformy. |
| Housekeeping kamera | ANO | ANO | PLNÁ | Obě platformy, Android nativní kamera. |
| Housekeeping lokální uložení nové fotky | NE explicitně | ANO | ŽÁDNÁ | Android-only behavior. |
| Lost-found filtry | ANO | ANO | ČÁSTEČNÁ | Android má méně filtrů. |
| Lost-found workflow status edit | ANO | ANO | ČÁSTEČNÁ | Android zjednodušené přes editor/claim flow. |
| Issues filtry stav + priorita + pokoj | ANO | ANO | ČÁSTEČNÁ | Android nemá stejnou granularitu jako web detail/list. |
| Issues timeline | ANO | NE | ŽÁDNÁ | Web detail má timeline, Android ne. |
| Inventory pictogram upload | ANO | NE | ŽÁDNÁ | Android inventory create/edit modul chybí. |
| Breakfast PDF import | ANO | ANO | PLNÁ | Obě platformy. |
| Breakfast PDF export | ANO | ANO | PLNÁ | Obě platformy. |
| Breakfast manager create/edit samostatně | ANO | NE | ŽÁDNÁ | Android vše inline. |
| Reports modul | ANO | NE | ŽÁDNÁ | Android chybí. |

## 6. Forenzní Rozdíly Po Modulech

### 6.1 Auth a shell

Web:

- login je samostatná card s wordmarkem, eyebrow copy, popisem, formulářem a APK download sekcí,
- má jasnou větu: reset hesla odesílá administrátor,
- shell používá `AppShell`, wordmark v headeru, module navigation a spodní `KajovoSign`,
- `Přeskočit na obsah` a skip-link je na webu explicitní.

Android:

- login je víc utilitární a méně brandový,
- místo APK downloadu má remember-me checkbox,
- top-level shell používá `PortalChrome`,
- Android má napevno v horní liště `Profil` a `Odhlásit`,
- Android přidává update prompt před loginem, což web nemá.

Závěr:

- web je silnější v informační architektuře loginu,
- Android je silnější v explicitních nativních kontrolách session a logoutu.

### 6.2 Utility stavy

Web utility:

- intro je skoro landing page,
- offline má `Zkusit znovu` i `Pracovat offline režimem`,
- maintenance má návrat i diagnostickou linku,
- 404 má portálovou copy navazující na provozní moduly.

Android utility:

- všechny utility stavy jsou velmi kompaktní,
- jeden titul, jeden text, jedno CTA,
- používají jednotný `StatePane`.

Závěr:

- parita existuje na úrovni existence,
- neexistuje na úrovni hustoty obsahu, navigační nabídky a kosmetické propracovanosti.

### 6.3 Recepce

Web:

- recepce hub používá 2 `StateView` karty,
- copy je delší a víc procesní.

Android:

- recepce hub tvoří 2 klikatelné `FeatureCard`,
- copy je stručnější a víc popisná.

Závěr:

- funkčně podobné,
- kosmeticky Android zjednodušený.

### 6.4 Pokojská

Web:

- samostatný quick capture formulář,
- výběr pokoje přes grid tlačítek,
- přepínání mezi `Nález` a `Závada`,
- oddělené CTA `Vybrat fotografie` a `Vyfotit`,
- po úspěchu samostatný `Hotovo` stav.

Android:

- podobný quick capture flow,
- pokoj jako chip/grid,
- foto picker + nativní kamera,
- po úspěchu `StatePane`,
- nově nativní vyfocený snímek zůstává i lokálně v zařízení.

Závěr:

- housekeeping je jedna z nejbližších parit,
- Android je teď silnější v nativní práci s kamerou a lokálním uložením.

### 6.5 Snídaně

Web:

- oddělené routy list/detail/create/edit,
- role `recepce` a `snídaně` mají odlišné surface,
- detailnější formuláře a samostatné detail obrazovky.

Android:

- jeden screen slučuje list, summary, service mode, manager editor a import preview,
- detail není route ani samostatná composable obrazovka,
- manager editor je inline pod seznamem,
- import potvrzení znovu otevírá PDF picker.

Závěr:

- Android nepřebírá webovou IA 1:1,
- přenáší business capability, ale ne strukturu pohledů.

### 6.6 Ztráty a nálezy

Web:

- samostatné list/detail/create/edit obrazovky,
- recepce má specifický čekající režim,
- detail i edit mají plný formulář a samostatnou navigaci.

Android:

- recepce má selected detail card uvnitř listu,
- mimo recepci je editor součástí stejného screenu jako filtry a seznam,
- create a edit nejsou samostatné view,
- filtry jsou užší než na webu.

Závěr:

- funkce na Androidu existují,
- view parita neexistuje.

### 6.7 Závady

Web:

- list, detail, create, edit jsou samostatné,
- detail obsahuje timeline,
- maintenance list má vlastní podobu,
- detailní akce jsou navázané na roli.

Android:

- list a editor/detail jsou spojeny,
- `selected` issue slouží jako detail,
- timeline chybí,
- Android deklaruje i create/edit v rámci jednoho screenu.

Závěr:

- Android pokrývá základní use-case,
- ale ztrácí strukturální a informační hloubku webového detailu.

### 6.8 Sklad

Web:

- list + movement card,
- admin detail/create/edit,
- pictogram upload,
- stocktake PDF,
- detail pohybů a mazání pohybů.

Android:

- list + movement card,
- bez samostatného detailu,
- bez create/edit položky,
- bez pictogram uploadu,
- bez stocktake PDF.

Závěr:

- inventory je na Androidu záměrně redukovaný,
- parita existuje jen pro list a založení pohybu.

### 6.9 Reports a dashboard

Web:

- reports view existují v kódu jako list/detail/create/edit,
- dashboard také existuje v kódu.

Android:

- reports chybí úplně,
- dashboard chybí úplně.

Závěr:

- nulová parita,
- je to největší povrchový rozdíl mezi platformami.

### 6.10 Profil

Web:

- profil obsahuje jméno, příjmení, telefon i poznámku,
- heslo je součástí stejného portálového modulu,
- texty jsou víc portálové než technické.

Android:

- profil je zúžený na jméno, příjmení, telefon,
- poznámka chybí,
- role se zobrazují přes `BulletLine`,
- změna hesla je samostatný screen,
- reset hesla je také samostatný screen.

Závěr:

- Android je jednodušší a čistší,
- web má bohatší editaci profilu.

## 7. Kosmetický Audit

### 7.1 Branding

Web:

- silný wordmark v loginu,
- shell wordmark nahoře,
- spodní signace jako trvalý brand marker,
- utility intro používá full lockup.

Android:

- používá hlavně `SignageBadge`,
- `PortalChrome` dává signage přímo do titulku top baru,
- footer je textový copyright, ne grafický brand prvek,
- vizuální branding je konzistentní, ale méně expresivní.

Verdikt:

- web je brandově bohatší,
- Android je brandově disciplinovaný, ale méně výrazný.

### 7.2 Typografie a textová hustota

Web:

- delší, přesnější a provoznější copy,
- utility texty jsou výrazně lepší než v Androidu,
- login copy je více lidská.

Android:

- častěji používá technické nebo interní formulace:
  - `Nativní Android start`
  - `Role-driven shell`
  - `Maintenance list + create + edit`
  - `Session-first bezpečnost`
- texty jsou kratší, ale někde působí jako implementační poznámka místo UX copy.

Verdikt:

- Android je informačně použitelný,
- ale copywriting je slabší než na webu.

### 7.3 Navigační chroma

Web:

- levá navigace, shell header, role switcher, skip link,
- jasnější oddělení obsahu od navigace.

Android:

- jeden top bar + volitelný FAB `Zpět`,
- méně robustní navigační kontext při hlubších flow,
- výhodou je explicitní `Odhlásit`.

Verdikt:

- web má lepší orientaci v rozsáhlejších modulech,
- Android je jednodušší, ale při sloučených screenech méně čitelný.

### 7.4 Mikrointerakce a CTA

Web:

- víc sekundárních CTA a návratových cest,
- detail/form/list jsou jasně oddělené toolbar akcemi.

Android:

- CTA jsou jednodušší a většinou lineární,
- u několika modulů se míchá výběr záznamu a editace do jednoho místa.

Verdikt:

- Android je rychlejší pro základní task,
- web je přesnější pro delší provozní práci.

## 8. Největší Neshody

1. Android nemá samostatné detail/create/edit obrazovky tam, kde je web má.
2. Android úplně postrádá reports modul.
3. Android úplně postrádá dashboard.
4. Android inventory je jen redukovaný movement-first flow.
5. Web nemá zjevný portal logout trigger, Android ano.
6. Web utility a login copy jsou výrazně kvalitnější než Android copy.
7. Android má update prompt a nativní reset flow navíc.

## 9. Rizika

- Uživatel přecházející mezi webem a Androidem nenajde stejné rozdělení obrazovek.
- Android v některých modulech působí, jako by uměl „všechno“, ale ve skutečnosti jen slučuje více use-case do jednoho view bez stejné hloubky.
- Web a Android mají odlišnou textovou kvalitu; to zvyšuje riziko provozní nejednoznačnosti.
- Sloučené Android screeny zhoršují auditovatelnost parity při budoucích změnách.

## 10. Doporučení

### Priorita A

- Sjednotit view model parity alespoň u `snídaně`, `ztráty a nálezy` a `závady`:
  - explicitně rozhodnout, zda Android zůstane „inline all-in-one“,
  - nebo zda přidá samostatné detail/edit screeny.

- Dopsat Android copy tak, aby nebyla interně-technická, ale provozně srozumitelná.

- Doplnit auditovatelnou specifikaci, které webové routy jsou záměrně mimo Android scope:
  - `reports`
  - `dashboard`
  - `inventory detail/create/edit`

### Priorita B

- U inventory rozhodnout, zda Android zůstane movement-only, nebo dostane read-only detail.
- U lost-found a issues zvážit oddělení selected detailu od editoru.
- U utility stavů přiblížit Android texty a recovery akce webu.

### Priorita C

- Sjednotit branding loginu mezi webem a Androidem.
- Rozhodnout, zda má web dostat explicitní logout trigger pro stejnou UX logiku jako Android.

## 11. Finální Verdikt

Mezi webem a Androidem dnes existuje:

- dobrá parita v přítomnosti hlavních provozních modulů,
- střední až slabá parita ve struktuře view,
- slabá parita v copywritingu a kosmetice,
- nulová parita u `reports`, `dashboard` a části inventory surface.

Pokud je cílem „stejný produkt na dvou platformách“, stav je dnes jen částečně srovnaný.  
Pokud je cílem „nativní provozní klient se stejným backendem a zúženým scope“, Android tomu odpovídá, ale musí to být explicitně pojmenované jako záměr, ne jako plná feature parity.
