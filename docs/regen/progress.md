# ORF Prompt Progress Tracker (00–15)

SSOT tracker pro prompty ORF-00 až ORF-15. Číslování je deterministické: každý řádek je právě jeden prompt slot, bez přeskakování.

| Prompt | Status | Evidence dir | PR/commit | Blockers | Next owner action |
| --- | --- | --- | --- | --- | --- |
| 00 | DONE | `docs/regen/00-forensics`, `docs/regen/00-orf-normalization` | `d20e17f`, `ORF-00 (current)` | None | Pokračovat promptem 01 podle parity mapy. |
| 01 | DONE (normalized) | `docs/regen/01-guardrails` + mapped fix `docs/regen/01-packaging-fix` | `0ed69b2`, `44eace0` | None | Slot 01 uzavřen; nepřidávat další fixy bez nového prompt slotu. |
| 02 | DONE (normalized) | `docs/regen/02-design-foundation` + mapped fix `docs/regen/02-webtests-fix` | `dc9b9b7`, `865be6f` | None | Slot 02 uzavřen; navázat až na nový explicitní scope. |
| 03 | DONE (normalized) | `docs/regen/03-visual-states-fix` | `5c1739c` | None | Slot 03 uzavřen; další visual změny vést pod novým promptem. |
| 04 | PARTIAL (split evidence) | mapped core `docs/regen/04-auth-foundation`, mapped fix `docs/regen/04-webtest-exit1-fix` | `ea591e8`, `a1047d9` | Funkční auth základ hotový, ale slot 04 obsahuje i test-stability fix mimo doménové jádro. | Při ORF-04 closure potvrdit finální scope a případně oddělit fix historii poznámkou v release docs. |
| 05 | PARTIAL (split evidence) | mapped core `docs/regen/05-admin-users`, mapped fix `docs/regen/05-webtest-command-fix` | `4f670b8`, `a6a9958` | Slot 05 obsahuje user-admin doménu i test command fix. | Při ORF-05 closure potvrdit, že doménové acceptance je splněné nezávisle na fix části. |
| 06 | DONE | `docs/regen/06-playwright-tablet-browser-fix` | `1c00e2c` | None | Slot 06 uzavřen. |
| 07 | DONE | `docs/regen/07-api-test-csrf-fix` | `ORF-07 (current)` | None | Slot 07 uzavřen (API test setup + CSRF/session). |
| 08 | DONE | `docs/regen/08-api-lint-fix` | `ORF-08 (current)` | None | Slot 08 uzavřen (API lint/CI fix-only). |
| 09 | DONE | `docs/regen/09-sqlite-db-path-fix` | `ORF-09 (current)` | None | Slot 09 uzavřen (SQLite test DB path/dir stabilizace). |
| 10 | DONE | `docs/regen/10-sqlite-ci-data-dir-fix` | `ORF-10 (current)` | None | Slot 10 uzavřen (SQLite CI data dir alignment). |
| 11 | DONE | `docs/regen/11-workspace-path-portability-fix` | `ORF-11 (current)` | None | Slot 11 uzavřen (workspace-path portability fix). |
| 12 | DONE | `docs/regen/12-api-test-tmpdir-fix` | `ORF-12 (current)` | None | Slot 12 uzavřen (API test DB tmpdir hardening). |
| 13 | DONE | `docs/regen/13-uvicorn-cwd-fix` | `ORF-13 (current)` | None | Slot 13 uzavřen (uvicorn subprocess cwd fix). |
| 14 | DONE | `docs/regen/14-contract-sync-fix` | `ORF-14 (current)` | None | Slot 14 uzavřen (OpenAPI + generated client contract sync). |
| 15 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/15-*/verification.md` a provést prompt scope. |

## Mapping poznámky (mimo-plán / nested evidence)

- `*-fix` adresáře jsou explicitně mapované k původním prompt slotům tak, aby nebyla nejasnost v číslování.
- `04-auth-foundation` a `05-admin-users` jsou vedené jako core evidence pro sloty 04/05.
- `04-webtest-exit1-fix` a `05-webtest-command-fix` zůstávají evidované jako podpůrné fix větve v rámci stejných slotů.
