# Otevřené nálezy

Datum: 2026-03-12
Zdroj pravdy: current HEAD, runtime testy, build/deploy skripty a `ManifestDesignKájovo.md`

## Kritické

1. Release gate padal na breakfast runtime smoke
- Stav: otevřeno
- Důkaz: `python scripts/release_gate.py`
- Soubory: `artifacts/release-gate/release-gate-1f87d229d557-20260312T175806.521183+0000.json`
- Popis: historický runtime smoke harness byl z repozitáře odstraněn, protože používal fake mailbox vrstvu a neměl dál sloužit jako release důkaz.

2. Manifest/UI gate padá na rozbitou SIGNACI
- Stav: otevřeno
- Důkaz: `pnpm ci:gates`
- Soubory: `packages/ui/src/shell/KajovoSign.tsx`, `apps/kajovo-hotel-web/tests/ci-gates.spec.ts`
- Popis: runtime vrací `aria-label="KÁJOVO"` místo `KÁJOVO`, takže manifest guard neprojde na desktopu, tabletu ani telefonu.

3. Aktivní branding a auth copy obsahují rozbitou češtinu
- Stav: otevřeno
- Důkaz: přímá inspekce current HEAD + cílený grep
- Soubory: `packages/ui/src/shell/KajovoWordmark.tsx`, `packages/ui/src/shell/KajovoFullLockup.tsx`, `packages/shared/src/i18n/auth.ts`, `apps/kajovo-hotel-web/src/routes/utilityStates.tsx`, `apps/kajovo-hotel-admin/src/routes/utilityStates.tsx`, `apps/kajovo-hotel-web/src/admin/AdminLoginPage.tsx`, `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
- Popis: rozbitá diakritika se propisuje do brand prvků, loginů i utility stavů, takže current HEAD neodpovídá manifestu ani finálnímu provoznímu UI.

## Vysoké

4. API timezone vrstva není konzistentní
- Stav: otevřeno
- Důkaz: přímá inspekce current HEAD + grep na `datetime.utcnow()` / `datetime.now()`
- Soubory: `apps/kajovo-hotel-api/app/api/routes/users.py`, `apps/kajovo-hotel-api/app/api/routes/lost_found.py`
- Popis: část API používá aware UTC helpery, ale některé routy stále zapisují naive datetime; hrozí drift v auditních a provozních datech.

5. Testy auth lockoutu stále používají deprecated `datetime.utcnow()`
- Stav: otevřeno
- Důkaz: warningy z `python scripts/release_gate.py`
- Soubory: `apps/kajovo-hotel-api/tests/test_auth_lockout.py`
- Popis: suite sice prochází, ale current HEAD není čistý na úrovni časové hygieny a bude dál generovat deprecation noise.

6. Mojibake guard nepokrývá všechny reálné degradace runtime textů
- Stav: otevřeno
- Důkaz: `python scripts/check_mojibake.py` -> PASS, ale cílený grep našel `KÁJOVO` a další rozbité runtime texty
- Soubory: `scripts/check_mojibake.py`
- Popis: současná guard logika chytá klasické mojibake sekvence, ale ne zachycenou degradaci přes `?` v aktivním UI.

## Další postup

1. Opravit release blocker v breakfast runtime smoke.
2. Opravit aktivní brand/shared/auth texty a přidat guard proti `Kájovo`/`KÁJOVO` driftu.
3. Sjednotit UTC helper usage v API a testech.
4. Znovu spustit `pnpm ci:gates`, `python scripts/release_gate.py` a relevantní API testy.
