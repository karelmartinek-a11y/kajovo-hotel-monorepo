## Povinny Release Proces Androidu A Produkce

- Kazda uzivatelsky viditelna zmena nativni Android appky musi byt vydana jako nova Android verze.
- Jedinym zdrojem pravdy pro Android release metadata je `android/release/android-release.json`.
- `android/app/build.gradle.kts` musi cist `versionCode` a `versionName` z release manifestu; rucni prepis verze mimo manifest je zakazany.
- Produkcni APK v `apps/kajovo-hotel-web/public/downloads/kajovo-hotel-android.apk` musi pri kazdem releasu odpovidat hashi `sha256` v release manifestu.
- Backend endpoint `/api/app/android-release` musi cist metadata z release manifestu a nesmi mit vlastni rucne udrzovanou verzi bokem.
- Produkcni deploy musi po nasazeni overit shodu mezi:
  - release manifestem v deploynutem repu,
  - produkcnim APK souborem,
  - live API endpointem `/api/app/android-release`,
  - runtime deploy artifactem na serveru.
- CI a GitHub workflow musi release integrity blokovat. Pokud release manifest, APK, build konfigurace, API metadata nebo deploy verification nejsou ve shode, release ani deploy nesmi projit.
- Android appka musi pri kazdem kontaktu s produkcnim serverem vyhodnocovat release metadata z odpovedi a pri nalezu nove verze spustit best-effort update flow.
- Ticha instalace bez systemovych opravneni neni povolena Android platformou. Povinnym minimem je automaticke stazeni APK, kontrola hashe a predani systemovemu installeru nebo jeho legalni fallback.
- Produkcni release signing Androidu pouziva keystore mimo git. GitHub musi mit secrets `KAJOVO_UPLOAD_STORE_FILE_B64` a `KAJOVO_UPLOAD_KEY_ALIAS`; store i key password se berou z existujiciho `HOTEL_ADMIN_PASSWORD`.

## Neporusitelne Pravidlo Web Android Parity

- Kazda runtime zmena webove aplikace musi byt spojena i s adekvatni runtime zmenou nativni Android appky.
- Kazda runtime zmena nativni Android appky musi byt spojena i s adekvatni runtime zmenou webove aplikace.
- Webova cast se povazuje za hotovou jen tehdy, kdyz je odladena pro vsechny tri povinne tridy zobrazeni: desktop, tablet a mobil.
- Android cast se povazuje za hotovou jen tehdy, kdyz zustava plne nativni. WebView-first, wrapper nebo pouhe zabaleni webu nejsou pripustne.
- Toto pravidlo je blokujici pro CI guardy i pro deploy rozhodnuti. Zmena jen na jedne platforme bez vedome navazane zmeny na druhe platforme nesmi projit.
- Povinne parity kontroly jsou `pnpm ci:policy` a `pnpm ci:policy-test`. Obe musi projit v GitHub Actions i pred releasem.
