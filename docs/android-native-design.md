# Návrh nativní aplikace KájovoHotel

Referenční panel: `docs/android-design/kajovo-hotel-native-app-concept.png`
Kompletní dodané logo: `docs/android-design/kajovo-hotel-logo-source.png`
Samostatná launcher značka: `docs/android-design/kajovo-hotel-app-mark.png`

## Závazné použití značky

- Intro/splash a přihlášení vždy používají kompletní logo včetně textu KájovoHotel.
- Samostatná značka bez textu je určena jen pro adaptivní launcher icon, malý shell badge a místa, kde Android vyžaduje čtvercovou bezpečnou zónu.
- Primární akcent je oranžový; černá, teplá bílá a stříbrná tvoří neutrální vrstvu. Stavové barvy nesmí být jediným nositelem informace.

## Nativní interakce

- Material 3, edge-to-edge, Compose, adaptivní phone/tablet layout.
- Systémové pickery pro foto/PDF, Camera contract, app links pro reset hesla.
- Blokující dialog pouze při zápisu kritického stavu pokoje; ostatní formuláře používají inline validaci a jednoznačný progress.
- Auto-update kontrola probíhá při startu před loginem. APK se stáhne, ověří SHA-256 a předá systémovému instalátoru; Android z bezpečnostních důvodů stále vyžaduje uživatelské potvrzení instalace.
