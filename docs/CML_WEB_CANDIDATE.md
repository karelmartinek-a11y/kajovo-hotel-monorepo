# KájovoHotel v CML – aktuální integrace

První vydání běží od 1. 11. 2026 pod `https://kajovocml.hcasc.cz/#hotel`.
Jeho výchozí publikovaný zdroj je `8cb10128e6382a1cab161087e66eb1f36bbbe42d`;
přesnou aktuální revizi určuje manifest skutečného API image/release.
Nové samostatně napsané UI vlastní tento repozitář v
`apps/kajovo-hotel-api/app/web_ui/`. Původní frontendový kód nebyl převzat.
Úplná přejímka předloh zůstává otevřená; první nasazení ji nenahrazuje.

## Autorita, role a vstup

`/cml-web/` vyžaduje explicitní veřejný JWKS v `CML_WEB_JWKS_PATH` a
jednorázový desetisekundový CML podpis pro audience `hotel`. Ověřuje issuer,
metodu, plnou cestu s query, tělo a CSRF. Nonce z migrace `0047_cml_web_nonce`
je společná všem workerům. Jen serverově ověřený ASGI state nese identitu.

CML grant se protíná s aktuálním aktivním nativním účtem a přiřazenými
rolemi Hotelu. Každý požadavek používá jednu místně ověřenou pracovní roli.
Hlavní účet zachovává původní technickou identitu a návaznost historie.
Provider credentials zůstávají pouze ve vlastním backendu. API, nativní
Android a vlastnictví obchodních dat zůstávají samostatné.

Produkční `CML_BROWSER_ENTRY_ONLY=1` odmítá původní obchodní browserové
relace a browserové Fetch Metadata/Origin i s nativní cookie. Nevebové
nativní relace zůstávají oddělené. Flag přijímá jen 0/1; chybná konfigurace
zastaví start. Přímé webové dokumenty vedou přes pevné přesměrování do CML.
Hostový Nginx směruje podepsanou cestu beze změny na vlastní API 8202 s 8m
limitem. Veřejný JWKS neobsahuje soukromý podpisový klíč ani cizí credentials.

Ruční i automatický výběr role načítá identitu přes `roleOverride`.
Globální role dalších API požadavků se změní až po úspěšné odpovědi pro
aktuální generaci. Opožděná odpověď ani opuštěná navigace ji nesmí změnit.
Neúspěšný výběr ponechá původní potvrzenou roli a zobrazí chybu. Formulář,
obnova původní odpovědi a následné čtení drží roli původní akce. Frontendová
oprava nerozšiřuje backendové RBAC.

## Zápisy a profily

`Idempotency-Key` na podporovaných CML obchodních routách rezervuje
`cml_web_request` před původním routerem. Čtení původního výsledku znovu
ověřuje aktuální účet a oprávnění. `completed` znamená uloženou HTTP
odpověď, nikoli automaticky obchodní úspěch. Nejistý účinek se neopakuje
a DB se kvůli návratu kódu neobnovuje. Migrace `0048_cml_web_request`
a původní účtenky musí zůstat zachované.

Centrální správa profilu a rolí používá původní Hotel API, pouze hlavního
vlastníka a pro zápis čerstvou podepsanou reautentizaci. Lokální credentials
ani resetovací toky tato cesta nepřijímá. Původní identity byly při cutoveru
propojeny podle schváleného pravidla e-mailu a hesla z Docházky; nativní
účty a jejich credentials zůstaly zachované.

`kajovo-profile-provision/1` atomicky vytváří nativní profil a neměnnou
účtenku přes podepsané `/cml-web/api/profiles`. Přijímá operation UUID,
centrální UUID a profilová pole bez hesla/nativního ID. Vyžaduje hlavního
vlastníka a čerstvé reauth. GET původního ID pouze čte. Konflikt e-mailu
nepřebírá cizí účet a změna argumentů stejného ID vrací konflikt. Smazání
profilu nemaže účtenku ani nepovoluje opětovné založení. Původní onboarding
se nevolá a případná pozvánka CML vzniká až nad nezávisle ověřenými vazbami.

## Hlas, push a stav rámce

Hlas je **zcela mimo integraci CML**. Původní `/admin/hlasovy-chat`,
`/admin/login`, jejich frontend, brand, nativní přihlášení a hlasový backend
zůstávají samostatné. Nové CML hlasové UI, bridge, migrace a provisioning
nejsou součástí práce. Nasazení API UI opravy zachovává obsah původních
hlasových balíčků i ověřenou původní release identitu. Podrobnosti:
[CML_VOICE_AUTHORITY.md](CML_VOICE_AUTHORITY.md).

WebPush používá jen obsahově prázdný `kajovo-hotel-chat-signal/1` a
`cml_authorized` z migrace `0050_cml_web_push_authority`; původní odběry
zůstaly zachované a nepovolené. Konkrétní obsah čte až oprávněný CML účet
původním API. Android FCM je oddělený. Návrat senderu se soukromým textem
nebo ignorování filtru není podporovaný rollback. Externí push doručení
nebylo při kvalifikaci nahrazeno tvrzením PASS z kontrolovaného adaptéru.

Opaque rámec uchovává pracovní datum pouze přes deklarovaný date bridge;
nemá přístup k parent DOM ani obecnému storage. Exporty používají původní
backend a nové oprávnění; citlivé soubory nezískávají veřejný bypass.

## Kvalifikace a vydání

Podrobný rozsah je v [CML_UI_COMPLETION.md](CML_UI_COMPLETION.md).
Role regression má 18 cílených případů v Chromium/WebKitu při
1920/834/390 px: poslední ruční volbu, zrušenou automatickou navigaci a
odmítnutí role se zachováním původní identity. Používá pouze izolované
čtecí adaptéry bez hotelové sítě nebo poskytovatelů.

Skutečná CML gateway a původní Hotel routery se ověřují nad izolovanými
DB a fake poskytovateli. To není produkční hotelový zápis, doručení zprávy,
placené modelové volání ani přejímka hovoru. Pro zveřejněný SHA musí projít
úplné CI a import skutečného API image; samotný lokální běh není release.
Koordinovaný SSH commit má trailer `CML-Coordinated-Cutover: true`, který
ponechá všechny CI gate a odloží pouze automatické přepnutí produkce.
Restartuje se jen potřebný runtime a chrání se původní konfigurace a stav.

Úplná vizuální matice, kosmetika, méně používané stavy, kompletní překlady,
tisk a přístupnost jsou **ODLOŽENO PO PRVNÍM NASAZENÍ**, nikdy PASS.
Autorizace, zachování dat a základní funkce se neodkládají.

## Standard 1.3

Centrální zápisy a zakládání pracovních profilů přijímají vedle čerstvého reauth také platně podepsanou politiku `owner-no-additional-prompts/1` pro `KRMAR78`/`admin` bez nativního ID. Členové ani neznámá politika tuto možnost nemají. Podpis, CSRF, jednorázové nonce, aktuální nativní identita, obchodní autorizace a účtenky zůstávají povinné; čas `reauthUntil` se nefalšuje.
