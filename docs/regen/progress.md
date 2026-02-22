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
| 07 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/07-*/verification.md` a provést prompt scope. |
| 08 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/08-*/verification.md` a provést prompt scope. |
| 09 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/09-*/verification.md` a provést prompt scope. |
| 10 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/10-*/verification.md` a provést prompt scope. |
| 11 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/11-*/verification.md` a provést prompt scope. |
| 12 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/12-*/verification.md` a provést prompt scope. |
| 13 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/13-*/verification.md` a provést prompt scope. |
| 14 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/14-*/verification.md` a provést prompt scope. |
| 15 | MISSING | — | — | Chybí evidence adresář i verification soubor. | Založit `docs/regen/15-*/verification.md` a provést prompt scope. |

## Mapping poznámky (mimo-plán / nested evidence)

- `*-fix` adresáře jsou explicitně mapované k původním prompt slotům tak, aby nebyla nejasnost v číslování.
- `04-auth-foundation` a `05-admin-users` jsou vedené jako core evidence pro sloty 04/05.
- `04-webtest-exit1-fix` a `05-webtest-command-fix` zůstávají evidované jako podpůrné fix větve v rámci stejných slotů.
