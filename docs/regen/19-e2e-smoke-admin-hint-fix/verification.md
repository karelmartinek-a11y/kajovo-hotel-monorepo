# ORF-09 fix-only – e2e smoke admin hint flow

## A) Cíl
- Opravit CI pád smoke testu v kroku admin hint flow (`auth-smoke.spec.ts`), kde se po kliknutí na „Poslat hint hesla" nezobrazoval očekávaný text.

## B) Exit criteria
- Admin UI umí poslat request `POST /api/auth/admin/hint` přes interní `fetchJson` helper bez `Unsupported API call` výjimky.
- Smoke test krok pro hint flow není blokovaný chybou v klientské vrstvě.
- Quality gates `lint`, `typecheck`, `unit` jsou PASS.

## C) Změny
- Rozšířen `fetchJson` v Admin app o podporu endpointu `POST /api/auth/admin/hint` včetně `credentials: include` a JSON payload.
- Tím se sjednotilo runtime chování login stránky s očekáváním smoke testu pro info message po úspěšném hint flow.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (environment): `pnpm ci:e2e-smoke`
  - Důvod: v tomto runneru chybí Playwright Chromium binary.
- FAIL (environment): `pnpm --filter @kajovo/kajovo-hotel-web exec playwright install chromium`
  - Důvod: download browseru vrací `403 Forbidden` z CDN, nelze lokálně dokončit e2e běh.

## E) Rizika/known limits
- Lokální e2e re-run nelze v tomto prostředí dokončit kvůli externímu browser provisioning blockeru (403 na Playwright CDN).
- Finální potvrzení fixu proběhne v CI, kde je browser provisioning součástí workflow.

## F) Handoff pro další prompt
- Ověřit v CI, že `ci:e2e-smoke` už nepadá na kroku očekávání textu „Pokud email odpovídá admin účtu, byl odeslán hint hesla.".
- Pokud by fail přetrval, přidat trace-based assertion na `role=alert/status` wrapper místo text-only locatoru.
