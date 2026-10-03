# Návrh nativní aplikace KájovoHotel

Referenční panel: `docs/android-design/kajovo-hotel-native-app-concept.png`
Kompletní dodané logo: `docs/android-design/kajovo-hotel-logo-source.png`
Samostatná launcher značka: `docs/android-design/kajovo-hotel-app-mark.png`

## Závazné použití značky

- Intro a přihlášení vždy používají kompletní logo včetně textu KájovoHotel. Systémový Android splash používá značku v bezpečné zóně systémové masky.
- Samostatná značka bez textu je určena jen pro adaptivní launcher icon, malý shell badge a místa, kde Android vyžaduje čtvercovou bezpečnou zónu.
- Primární akcent je oranžový; černá, teplá bílá a stříbrná tvoří neutrální vrstvu. Stavové barvy nesmí být jediným nositelem informace.

## Nativní interakce

- Material 3, edge-to-edge, Compose, adaptivní phone/tablet layout.
- Zaměstnanecké mobilní záhlaví a zápatí kopírují mobilní web: pevné záhlaví 64dp s logem, třemi jazyky a odhlášením; pevné zápatí 72dp s vodorovným posunem, webovými piktogramy modulů, aktivním zvýrazněním a Profilem. V záhlaví není role, nabídka ani navigace. Přístup do dalších přiřazených rolí se řeší při otevření modulu ze zápatí; obrazovka výběru role se nezobrazuje. Obsah každého modulu se posouvá samostatně mezi pevnými pruhy.
- Nativní pokojská zachovává dosavadní mobilní čtyřsloupcovou mřížku, pořadí pokojů, 106dp dlaždice, barvy odjezdu/příjezdu/pobytu, drobné popisky a spodní detail. Web má samostatný pevný formát rezervací a osm stavů; tento redesign se na Android nevztahuje. Zobrazení odděluje aktuální obsazenost od pobytů vybraného dne, obnovuje se po návratu do aplikace a každou minutu, podporuje pouze čtení i zápis, šest nativních stavových akcí, nejednoznačný zápis s obnovou a přepnutí na podrobné pobyty/ikony. Rezervační ikony se mění přes verzi existujícího API.
- Snídaňový zaměstnanecký přehled kopíruje mobilní web: bez hledání a správcovských ovládacích prvků, s datem/šipkami/Dnes, názvem, kompaktní kartou, dietními piktogramy, společností, pobytem, věkovými počty, poznámkou a plnošířkovou akcí výdeje. Zrušené a již vydané položky nelze znovu vydat.
- Systémový bezpatkový font s běžným a tučným řezem; textové dvojice barev se v obou tématech testují na kontrast nejméně 4,5:1. Kompletní černé logo má světlou podložku i v tmavém režimu.
- Přihlášení zachovává formulář při odeslání, skryje klávesnici a zobrazí chybu nad tlačítkem. Krátké obrazovky se vejdou na telefon; seznamy, dlouhý obsah, malé okno s klávesnicí a velké systémové písmo mohou bezpečně posouvat obsah.
- Filtry seznamů jsou rozbalovací. Nálezy mají kroky Předmět/Místo/Předání, závady Závada/Stav a priorita, snídaně Host/Stav a diety. Poznámka pro pokojskou u snídaní se čte z Better Hotel API a v editoru se nemění.
- Systémové pickery pro fotografie, Camera contract, app links pro reset hesla. PDF export snídaní lze uložit nebo sdílet; PDF import není dostupný.
- Blokující dialog pouze při zápisu kritického stavu pokoje; ostatní formuláře používají inline validaci a jednoznačný progress.
- Kontrola vydání probíhá při startu. Povinný update blokuje všechny zaměstnanecké obrazovky včetně již přihlášené relace; stav povinné verze známý z odpovědi API se ukládá mezi spuštěními a při nedostupném manifestu zobrazí blokovací opakování kontroly. Volitelný update lze odložit. APK se stáhne, ověří SHA-256 a předá systémovému instalátoru; Android z bezpečnostních důvodů stále vyžaduje uživatelské potvrzení instalace. Při aktivním povinném manifestu API odmítne starší OkHttp Android klienty kódem 426 kromě veřejné kontroly release manifestu.
- Příznak automatického spuštění se spotřebuje až po dokončení aktualizační operace, aby změna Compose efektu nepřerušila stahování. Zrušení coroutine není síťová chyba a neotevírá náhradní prohlížeč.
