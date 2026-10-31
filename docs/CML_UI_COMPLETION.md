# Doplnění nového Hotel UI

Nové UI ve `app/web_ui` se doplňuje proti skutečným API a dodaným PNG. Původní
frontendové komponenty ani jejich implementace se nepoužívají. Produkční baseline
zůstává `11cde6c60768ebec9eaa31788c524aef73e1c19f`; lokální rozšíření není release.

| Oblast | Dopad |
| --- | --- |
| Nový frontend a manifest | Doplnit chybějící pracovní toky a grafické stavy |
| Obchodní služby/API/Android | Zachovat původní data, výpočty a spotřebitele |
| CML boundary a migrace | Přidat vlastní trvalé identity webových zápisů a čtecí obnovu |
| Testy a fixtures | Skutečné routery nad izolovaným stavem, fake poskytovatelé, zákaz externí sítě |
| Build, CI a dokumentace | Zapojit nové JS kontroly, migraci, manifest a kvalifikaci |
| Auth, role a secrets | Aktuální lokální identita a oprávnění před čtením původního výsledku |
| Hlas a paměť | Zachovat backend; nový frontend vyžaduje samostatné zapojení a mikrofonní ověření |
| Produkce a publikace | Až po funkčních, vizuálních a bezpečnostních branách celé integrace |

Webový zápis s `Idempotency-Key` se před předáním původnímu routeru trvale
rezervuje ve vlastní databázi Hotelu. Opakování nemůže znovu vykonat původní
router. Potvrzení ukládá původní HTTP stav a JSON výsledek; čtení výsledku znovu
ověřuje aktuální identitu a původní oprávnění. Selhání mezi obchodním účinkem a
potvrzením zůstává nejistotou. Neexistuje automatický replay ani obnovování DB.
Původní nativní/strojové endpointy se tímto obalem nevedou.

## Místně ověřený rozsah

Nové UI poskytuje deset hlavních administrátorských pohledů. Přehled čte původní
API; neověřená metrika zůstává neověřená a skladové jednotky se nesčítají napříč
různými jednotkami. Sklad má příjem, výdej a odpis s původní historií pohybů.
Formuláře uchovávají přijatý výsledek odděleně od následného čtení. Ztracená
odpověď nevyvolá druhé vytvoření ani nový poskytovatelský příkaz. Přepnutí
podsekce nezahodí otevřený formulář ani jeho původní lokální roli.

Manifest rozlišuje administrátorské a zaměstnanecké reference, hlavní názvy od
navigačních popisků a deklarované dialogy pro přesnou kontextovou nápovědu.
Nativní aktuální oprávnění se stále ověřuje pro každou operaci; sjednocená nabídka
více rolí není rozšířením jedné aktivní API role. SMTP formulář používá původní
Hotel konfiguraci a šifrování. Uložené heslo se nečte do prohlížeče. Nejasná změna
hesla není vydávána za ověřené připojení a test e-mailu je samostatná uživatelská akce.
Při kvalifikaci se žádný skutečný e-mail neodesílá.

Backend: 374 úspěšných API testů včetně aditivní migrace, zachování starých řádků,
nevratnosti identit, souběžného přijetí ve dvou workerech a revokace oprávnění.
Dva JS testy řeší pražský jarní neexistující čas a obě podzimní instance.
Samostatná kontrola parsuje všechny nové JS moduly a ověřuje manifest obou rolí;
release gate zahrnuje obě kontroly a jeho dosavadních jedenáct testů prošlo.
Úplný lint Python aplikace a API testů a scan celého aplikačního zdroje prošly.

Chromium i WebKit kvalifikují deset hlavních pohledů při 1920/834/390 px,
izolaci od parent DOM, původní identitu po ztracené odpovědi, následné ověření
úpravy, tři skladové pohyby, úklid s jediným fake poskytovatelským zápisem,
uložení SMTP konfigurace bez SMTP volání a zaměstnance s více skutečnými rolemi.
Pokus použít nepřiřazenou roli admin je odmítnutý. Integrační scénář je
`tests/library/hotel-ui.browser.mjs` v samostatném CML repozitáři.

## Neuzavřené části

Zbývá úplná matice 111 předloh a všech jejich chybových stavů, přesné lokální
překlady, další snídaňové a skladové operace, fotografie/exporty, oznámení a hlas.
Hlas dosud nemá ověřený mikrofon v opaque rámci. Přímé browserové přihlášení
není odstřižené a nový převod identit není provedený v produkci. Centrální životní
cyklus nových profilů/pozvánek a širší členské granty mají vlastní společné brány.

Obnova webového výsledku nyní vyžaduje jeho původní ID; objevování nedokončených
pokusů po úplném znovunačtení dokumentu není tímto checkpointem kvalifikované.
Obecná databázová nebo poskytovatelská chyba zůstává nejistá. Uložená původní
HTTP chyba nikdy není označena jako potvrzení, že obchodní účinek nenastal.

Publikace GitHub main, plné CI, produkční build/rollout a živá přejímka celé
integrace zůstávají neprovedené. Staré browserové vstupy ani nativní Android
nebyly tímto checkpointem vypnuté. Nebyla založena žádná firma ani agentura.
