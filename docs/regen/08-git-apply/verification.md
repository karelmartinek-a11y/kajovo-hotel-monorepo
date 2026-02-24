# 08 Git apply – verification

## A) Cíl
Zdokumentovat přesný postup, jak aplikovat patch pomocí `git apply`.

## B) Exit criteria
- Existuje krokový návod pro `git apply` včetně dry-run, 3-way fallbacku a řešení rejectů.

## C) Změny
- Přidán tento soubor s postupem:

### Jak aplikovat patch (`git apply`)
1. Ulož patch do souboru, např. `changes.patch`.
2. Ověř patch bez změny pracovního stromu:
   - `git apply --check changes.patch`
3. Aplikuj patch:
   - `git apply changes.patch`
4. Pokud patch nesedí čistě, zkus 3-way merge:
   - `git apply --3way changes.patch`
5. Pokud chceš rovnou vytvořit stage změn:
   - `git apply --index changes.patch`
6. Pokud máš `.rej` soubory, otevři je, oprav konflikty ručně, poté:
   - `git add <opravené_soubory>`
   - `git commit`

### Alternativa (když patch obsahuje commit metadata)
- Pokud je to mailbox patch (`git format-patch`), použij:
  - `git am < patch.mbox`

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit` (lokální Python 3.10 neobsahuje `enum.StrEnum`; CI používá Python 3.11)

## E) Rizika/known limits
- `git apply` neudělá commit automaticky.
- `git apply` funguje nad diffem; při větším driftu větve je často potřeba `--3way` nebo ruční merge.

## F) Handoff pro další prompt
- Pokud uživatel pošle konkrétní patch soubor, další krok je provést `git apply --check` a následně aplikaci s nejvhodnější strategií (`plain` vs `--3way`).
