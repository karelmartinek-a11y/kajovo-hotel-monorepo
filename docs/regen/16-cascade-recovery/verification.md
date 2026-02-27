# Verification — 16 cascade recovery planning

## Cíl
- Zhodnotit aktuální stav kaskády promptů 00–15.
- Vyhodnotit kvalitu a úspěšnost dosavadních výstupů.
- Připravit konkrétní recovery plán dalšího postupu.

## Jak ověřeno (příkazy + výsledek)
1. `git log --oneline --decorate -n 25`
   - Ověření posloupnosti implementačních a fix commitů.
2. `for i in $(seq -w 0 15); do d=$(find docs/regen -maxdepth 1 -type d -name "$i-*" | tr '\n' ' '); if [ -n "$d" ]; then echo "$i: $d"; else echo "$i: MISSING"; fi; done`
   - Ověření pokrytí promptů podle číslovaných regen složek.
3. `sed -n '1,220p' docs/regen/parity/parity-map.yaml`
   - Ověření parity statusů, zejména `admin_portal_split`, `device`, `entity_id_flow`.
4. `pnpm ci:policy`
   - Výsledek: PASS.
5. `pnpm ci:verification-doc`
   - Výsledek: PASS (mimo PR kontext korektní skip).
6. `pnpm typecheck`
   - Výsledek: PASS (`tsc --noEmit`).
7. `python -m pytest apps/kajovo-hotel-api/tests/test_health.py`
   - Výsledek: FAIL (`RuntimeError: API did not start in time` ve fixture bootstrapu).

## Co se změnilo
- Přidán audit prompt kaskády: `docs/regen/16-cascade-recovery/prompt-cascade-assessment.md`.
- Přidána verifikace kroku: `docs/regen/16-cascade-recovery/verification.md`.

## Rizika / known limits
- Test `test_health.py` je v lokálním prostředí nestabilní při bootstrapu API procesu ve fixture (nutná následná stabilizační oprava v samostatném kroku).
- Hodnocení je forenzní (repo evidence); neobsahuje CI run metadata z GitHub API.
