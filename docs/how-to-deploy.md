# Produkční deploy

## Autoritativní zdroje

- `.github/workflows/ci-gates.yml`
- `.github/workflows/deploy-production.yml`
- `infra/ops/deploy-production.sh`
- `android/release/android-release.json`
- `docs/github-settings-checklist.md`

Když se tento dokument rozchází s workflow nebo skripty, rozhodují workflow a skripty.

## Release a deploy tok

1. Změny se integrují do `main`.
2. Blokující current-state gate je `CI Gates - KajovoHotel`.
3. Po úspěšných gate může běžet `Deploy - hotel.hcasc.cz`.
4. Deploy používá přesné SHA, které prošlo CI, a zapisuje runtime evidenci na server.
5. Deploy není hotový, dokud nesedí live runtime, release metadata a veřejná APK.

## Neporušitelné parity pravidlo

- každá runtime změna webu musí mít adekvátní runtime změnu Android appky
- každá runtime změna Android appky musí mít adekvátní runtime změnu webu
- web musí zůstat odladěný pro desktop, tablet a mobil
- Android musí zůstat plně nativní

Toto pravidlo blokují `pnpm ci:policy` a `pnpm ci:policy-test`.

## Android release

- Jediný zdroj pravdy je `android/release/android-release.json`.
- `android/app/build.gradle.kts` čte `versionCode` a `versionName` z manifestu.
- Veřejná APK je `apps/kajovo-hotel-web/public/downloads/kajovo-hotel-android.apk`.
- Backend endpoint `/api/app/android-release` vrací data ze stejného manifestu.
- Před releasem je povinné spustit `python scripts/check_android_release_integrity.py`.

## GitHub secrets a variables

Povinné:

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_PASS`
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`
- `KAJOVO_UPLOAD_STORE_FILE_B64`
- `KAJOVO_UPLOAD_KEY_ALIAS`

Volitelné aliasy:

- `KAJOVO_API_ADMIN_EMAIL`
- `KAJOVO_API_ADMIN_PASSWORD`

Alias hodnoty se musí rovnat kanonickým admin credentials.

## Co deploy workflow ověřuje

- zdraví `postgres`, `api`, `web`, `admin`
- veřejné endpointy `/`, `/admin/login`, `/api/health`
- live admin login
- shodu runtime artifact SHA s deployovaným SHA
- live `/api/app/android-release` neodpovídá release manifestu commitnutému v GitHubu je blokující stav
- shodu live `/api/app/android-release` s manifestem a veřejnou APK
- zápis Android release metadat do runtime artifactu

## Preview build

Bez produkčního nasazení lze použít workflow `Preview Build - Kajovo Hotel` v `.github/workflows/preview.yml`.
