# A) Cíl
Opravit PR #95 tak, aby prošel CI guardrails kontrolou – konkrétně přidat povinný verifikační dokument do `docs/regen/28-fix-pr-for-tests/`, který vyžaduje skript `ci:verification-doc`.

# B) Exit criteria
- CI job `guardrails` projde zeleně pro tento PR.
- Verifikační dokument obsahuje všechny povinné sekce (A–F).
- Žádné ostatní CI joby nejsou narušeny.

# C) Změny
- Přidán soubor `docs/regen/28-fix-pr-for-tests/verification.md` se všemi požadovanými sekcemi.

# D) Ověření
- Lokálně: `pnpm ci:verification-doc` vrátí "Verification doc gate passed."
- CI: job `guardrails` musí být zelený po pushnutí tohoto commitu.

# E) Rizika/known limits
- Ostatní CI joby (testy, lint, typecheck) nebyly tímto PR změněny a zůstávají ve stavu z předchozích commitů.

# F) Handoff pro další prompt
- Po zelených CI výsledcích lze PR mergovat do základní větve.
- Pokud jiný CI job selže, zkontroluj logy konkrétního jobu a oprav příslušné soubory.
