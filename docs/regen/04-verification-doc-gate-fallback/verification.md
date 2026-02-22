# Verification – 04 verification-doc gate fallback

## cíl
Opravit CI gate `check-pr-verification-doc.mjs`, aby spolehlivě detekoval změnu `docs/regen/<NN>-<slug>/verification.md` i při chybě `no merge base`.

## co se změnilo
- Rozšířena strategie výpočtu změněných souborů v `apps/kajovo-hotel/ci/check-pr-verification-doc.mjs`:
  1. primárně diff `origin/<baseRef>...HEAD` po hlubším fetch,
  2. fallback přes `pull_request.base.sha` z `GITHUB_EVENT_PATH` + diff `baseSha..HEAD` (nevyžaduje merge base),
  3. poslední fallback na lokální změny + soubory z HEAD commitu.
- Přidáno čtení PR base SHA z GitHub event payloadu.

## jak ověřeno
- `GITHUB_BASE_REF=main node apps/kajovo-hotel/ci/check-pr-verification-doc.mjs`
  - očekávání: skript doběhne bez syntaktické chyby; v lokálním fallback režimu správně vyhodnotí přítomnost verification doc.
- `pnpm -C apps/kajovo-hotel-web lint`
  - očekávání: beze změny, zelený TypeScript gate.

## rizika/known limits
- Pokud CI checkout neobsahuje ani base ref ani base SHA objekt, skript přejde na lokální fallback; ten je best-effort a spoléhá na dostupný git stav runneru.
