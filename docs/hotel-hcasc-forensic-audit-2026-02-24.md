# Forenzní audit nasazení: kajovo-hotel-monorepo -> hotel.hcasc.cz

Datum: 2026-02-24

## Cíl

- Zhodnotit připravenost repozitáře na build/deploy pro produkci `hotel.hcasc.cz`.
- Opravit nalezené blokátory v kódu/testech, které brání důvěryhodnému release procesu.
- Vytvořit konkrétní seznam: co je hotové, co zbývá a kdo je owner.

## Co jsem provedl teď (forenzní audit + remediation)

### 1) Ověření deploy podkladů a infrastruktury

- Ověřena existující produkční compose konfigurace (`infra/compose.prod.yml` + host override `infra/compose.prod.hotel-hcasc.yml`).
- Ověřen produkční deploy skript (`infra/ops/deploy-production.sh`) včetně build/recreate flow a logování deploy SHA.
- Ověřena dokumentace deploy/staging flow (`docs/how-to-deploy.md`, `docs/how-to-deploy-staging.md`).
- Ověřen Nginx reverse proxy návrh pro nový stack (`infra/reverse-proxy/production-new.conf`).

### 2) Spuštění API testů (důkaz funkčnosti backendu)

- Spuštěna plná sada API testů.
- Původně padaly RBAC + SMTP testy (forenzně potvrzeno).
- Následně opraveny příčiny v testovací a RBAC vrstvě.

### 3) Oprava RBAC nesouladu (warehouse/maintenance aliasy)

Byly opraveny nesoulady mezi historickým anglickým názvoslovím rolí v testech a aktuálním českým RBAC modelem:

- Přidána role `sklad` do `ROLE_PERMISSIONS` (čtení/zápis skladu + čtení hlášení).
- Přidány aliasy rolí:
  - `warehouse` -> `sklad`
  - `maintenance` -> `údržba`
  - `reception` -> `recepce`
  - `breakfast` -> `snídaně`
  - `housekeeping` -> `pokojská`
- Doplněn seeded test user `warehouse@example.com` s rolí `sklad` pro RBAC scénáře.
- Sjednoceno očekávání audit trail role na kanonickou hodnotu `údržba`.

### 4) Oprava SMTP testu po změně API kontraktu uživatele

- Test vytvářející uživatele byl zastaralý (chyběla povinná pole `first_name`, `last_name`, `roles`).
- Test byl aktualizován na aktuální schema `PortalUserCreate`.
- Aktualizováno očekávání subjectu admin emailu na aktuální hodnotu `KájovoHotel admin unlock`.

### 5) Re-validace

- Po opravách proběhly všechny API testy úspěšně.

## Aktuální forenzní závěr (produkční připravenost)

### Stav build/deploy podkladů

- **Build a deploy mechanika v repu existuje** (compose, deploy script, reverse-proxy config, smoke/verify skripty).
- **Největší riziko není v absenci skriptů**, ale v provozní exekuci na serveru (proměnné prostředí, reverse proxy přepnutí, DB migrace/cutover, runtime validace).

### Stav aplikace

- API testovací základ je stabilní (30/30 pass).
- Portal/admin část je funkčně pokročilá, ale produkční cutover musí projít řízeným runbookem (viz níže).

## Co je hotové

- [x] Forenzní průchod deploy artefaktů pro produkci/staging.
- [x] Forenzní průchod reverse-proxy konfigurace.
- [x] Forenzní průchod API test pipeline.
- [x] Oprava RBAC nesouladu v rolích + aliasech.
- [x] Oprava seed dat pro RBAC test.
- [x] Oprava SMTP integračního testu dle aktuálního kontraktu.
- [x] Re-run API testů: vše pass.

## Co je potřeba dokončit před ostrým deploy na hotel.hcasc.cz

### P0 (blokery go-live)

1. **Produkční .env a tajemství**
   - Připravit/zkontrolovat `infra/.env` na serveru: DB URL, admin credentials, SMTP, session secret, CORS/cookie parametry.
   - Owner: **DevOps + Backend lead**

2. **DB migrace + záloha + rollback bod**
   - Udělat ověřený backup stávající DB.
   - Projít migrace proti cílové DB a potvrdit konzistenci.
   - Owner: **DBA/DevOps + Backend lead**

3. **Reverse proxy cutover na nový stack**
   - Nasadit `infra/reverse-proxy/production-new.conf` podle reálného hostname/TLS setupu.
   - Připravit okamžitý rollback na legacy variantu.
   - Owner: **DevOps**

4. **Deploy na produkční host + smoke verifikace**
   - Spustit `infra/ops/deploy-production.sh`.
   - Po deploy spustit health/ready/smoke (`infra/verify/verify-deploy.sh`, `infra/smoke/smoke.sh`).
   - Owner: **DevOps + QA**

### P1 (silně doporučeno bezprostředně po go-live)

5. **UAT proti produkci se skutečnými rolemi**
   - Projít scénáře v `docs/uat.md`, vyplnit výsledek.
   - Owner: **QA + Product owner + Hotel operations key-users**

6. **Monitoring a alerting**
   - Zapnout/ověřit sběr logů, retention, alerty na `/health` a `/ready`, 5xx rate.
   - Owner: **DevOps/SRE**

7. **Formální release checklist evidence**
   - Vyplnit `docs/release-checklist.md` + uložit release SHA, timestamp, odpovědnou osobu.
   - Owner: **Release manager**

### P2 (stabilizace)

8. **E2E browser testy v CI runtime s browser dependencies**
   - V auditním prostředí chyběl Playwright browser runtime; ověřit v CI/prod-like runneru.
   - Owner: **QA automation + DevOps**

9. **Pravidelný DR drill**
   - Ověřit restore postup (`infra/ops/restore.ps1`/runbook) na test prostředí.
   - Owner: **DevOps + DBA**

## Doporučený exekuční plán (rychlý)

1. T-1 den: `.env` + secrets + DB backup + proxy config review
2. T-0: deploy script + smoke + verify
3. T+0 až T+1h: UAT smoke s klíčovými rolemi
4. T+1 den: post-release review + monitoring baseline

## Evidence příkazů použitých v auditu

- `python -m pytest apps/kajovo-hotel-api/tests -q`
- `python -m pytest apps/kajovo-hotel-api/tests/test_rbac.py -q`
- `python -m pytest apps/kajovo-hotel-api/tests/test_smtp_email_service.py -q`
- kontrola deploy artefaktů přes čtení:
  - `infra/ops/deploy-production.sh`
  - `infra/compose.prod.yml`
  - `infra/compose.prod.hotel-hcasc.yml`
  - `infra/reverse-proxy/production-new.conf`
  - `docs/how-to-deploy.md`
  - `docs/how-to-deploy-staging.md`

