# A) Cíl

Uzavrit PR verification gate pro finalni remediation branch a zanechat auditni stopu k merge fixum po synchronizaci s `main`, zejmena pro CI bootstrap Python zavislosti, smoke DB seed admin uctu a release workflow stabilizaci.

# B) Exit criteria

- V PR diffu existuje `docs/regen/28-remediation-release-verification/verification.md`.
- Guardrail job `ci:verification-doc` vidi aspon jeden novy `docs/regen/<NN>-<slug>/verification.md`.
- Dokument pokryva merge-fix scope: CI bootstrap, smoke auth seed, contract/export kompatibilitu a release follow-up.

# C) Změny

- Doplnen novy verification dokument pro finalni remediation/merge fix vlnu.
- Scope teto vlny:
  - seed admin uctu do smoke SQLite bootstrapu,
  - doplneni `cryptography` a Python bootstrapu do GitHub Actions jobu,
  - srovnani PR gate tak, aby branch mela vlastni verification artifact.

# D) Ověření

- Lokalni validace:
  - `python -m pytest apps/kajovo-hotel-api/tests -q`
  - `corepack pnpm ci:gates`
  - cilene lint/test kontroly po merge conflict resolution
- Vzdaleny guardrail ma po tomhle dokumentu videt novy `docs/regen/28-remediation-release-verification/verification.md`.

# E) Rizika/known limits

- Dokument sam o sobe neopravi aplikacni chyby; pouze odemyka verification gate.
- Pokud se base branch znovu posune a PR diff ztrati tenhle soubor, gate spadne znovu.

# F) Handoff pro další prompt

- Pokud po pushi zustane padat CI, pokracovat uz jen nad konkretnimi job logy a nevytvaret dalsi ad-hoc merge bez nove verification poznamky.
- Pri dalsi release stabilizaci aktualizovat tento dokument nebo pridat novy `docs/regen/<NN>-<slug>/verification.md` podle scope zmen.
