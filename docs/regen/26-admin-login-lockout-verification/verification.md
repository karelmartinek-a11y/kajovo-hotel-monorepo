# A) Cíl

Doplnit povinný verifikační dokument pro změny kolem admin login UX, lockout chování (HTTP 423), i18n textů a navazujících testů tak, aby PR prošlo CI gate kontrolou na existenci `docs/regen/<NN>-<slug>/verification.md`.

# B) Exit criteria

- V PR existuje soubor `docs/regen/26-admin-login-lockout-verification/verification.md`.
- Soubor obsahuje všechny povinné sekce:
  - `A) Cíl`
  - `B) Exit criteria`
  - `C) Změny`
  - `D) Ověření`
  - `E) Rizika/known limits`
  - `F) Handoff pro další prompt`
- Repo je v konzistentním stavu a změna je commitnutá.

# C) Změny

- Přidán verifikační dokument:
  - `docs/regen/26-admin-login-lockout-verification/verification.md`
- Dokument shrnuje účel změn z PR (admin login UX + lockout), CI očekávání a známá omezení testovacího prostředí.

# D) Ověření

- Kontrola existence souboru a struktury sekcí proběhla lokálně.
- Ověřeno, že nový soubor je sledovaný v gitu a připravený pro CI gate.

# E) Rizika/known limits

- Tento commit řeší dokumentační gate v CI, nikoliv aplikační logiku.
- Pokud CI vyžaduje jiný konkrétní `<NN>-<slug>` naming pattern než `26-admin-login-lockout-verification`, bude potřeba název adresáře upravit dle přesného pravidla pipeline.

# F) Handoff pro další prompt

- Pokud CI gate stále hlásí chybějící `verification.md`, zkontrolovat přesný požadovaný target adresář z job logu a případně:
  1. přesunout tento soubor do požadovaného `docs/regen/<NN>-<slug>/`,
  2. ponechat stejné povinné sekce,
  3. re-run pipeline.
- Při dalších změnách v této oblasti pokračovat s aktualizací této verifikace (sekce C/D/E), aby byl audit trail úplný.
