# Release checklist

## Povinné před releasem

- Každá runtime změna webu musí mít odpovídající runtime změnu Android appky a naopak.
- Ověřit web na desktopu, tabletu a mobilu.
- Ověřit, že Android zůstává plně nativní.
- Zkontrolovat, že README a current-state dokumentace odpovídají skutečným změnám.

## Povinné lokální kontroly

```bash
pnpm typecheck
pnpm unit
pnpm ci:gates
pnpm ci:e2e-smoke
pnpm contract:check
```

## Když se mění Android runtime nebo veřejná APK

- Upravit `android/release/android-release.json`.
- Nahradit `apps/kajovo-hotel-web/public/downloads/kajovo-hotel-android.apk`.
- Přepočítat `sha256` v release manifestu.
- Spustit `python scripts/check_android_release_integrity.py`.
- Ověřit, že live `/api/app/android-release` vrací stejná data jako manifest.

## Když se mění web nebo admin UI

- Projít smoke a visual testy.
- Zkontrolovat signaci, branding a responsivitu.
- Zkontrolovat utility stavy a recovery akce.

## Kdy je release hotový

- CI gate prošly.
- Deploy runtime SHA sedí.
- Live `/api/app/android-release` sedí s manifestem a veřejnou APK.
- Dokumentace v `docs/` odpovídá realitě po releasu.
