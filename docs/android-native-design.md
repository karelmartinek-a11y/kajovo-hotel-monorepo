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
- Pevné kompaktní záhlaví s logem, názvem sekce, přepnutím role a menu oprávněných sekcí/profilu. Bez spodního copyrightu, duplicitních nadpisů a vysvětlování implementace.
- Systémový bezpatkový font s běžným a tučným řezem; textové dvojice barev se v obou tématech testují na kontrast nejméně 4,5:1. Kompletní černé logo má světlou podložku i v tmavém režimu.
- Přihlášení zachovává formulář při odeslání, skryje klávesnici a zobrazí chybu nad tlačítkem. Krátké obrazovky se vejdou na telefon; seznamy, dlouhý obsah, malé okno s klávesnicí a velké systémové písmo mohou bezpečně posouvat obsah.
- Filtry seznamů jsou rozbalovací. Nálezy mají kroky Předmět/Místo/Předání, závady Závada/Stav a priorita, snídaně Host/Stav a diety. Všechna původní pole a validace zůstávají dostupné.
- Systémové pickery pro foto/PDF, Camera contract, app links pro reset hesla.
- Blokující dialog pouze při zápisu kritického stavu pokoje; ostatní formuláře používají inline validaci a jednoznačný progress.
- Auto-update kontrola probíhá při startu před loginem. APK se stáhne, ověří SHA-256 a předá systémovému instalátoru; Android z bezpečnostních důvodů stále vyžaduje uživatelské potvrzení instalace.
