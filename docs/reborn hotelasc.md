# Forenzní analýza: proč aktuální stav repozitáře nejde spolehlivě buildnout/deploynout/nasadit na `hotel.hcasc.cz`

Datum auditu: 2026-02-28

## 1) Co jsem ověřil (forenzní postup)

Spuštěné kontroly nad aktuálním stavem repozitáře:

- `pnpm -r build`
- `pnpm ci:gates`
- `python -m pytest apps/kajovo-hotel-api/tests`
- `python -m pytest apps/kajovo-hotel-api/tests/test_auth_role_selection.py -vv -s`
- `bash infra/verify/verify-deploy.sh`
- statická revize klíčových souborů pro API auth/users/RBAC, compose a deploy skripty

## 2) Shrnutí nálezu (executive summary)

### Co funguje
- Frontend build (`web`, `admin`) je sestavitelný.

### Co blokuje produkční „ready“ stav
- **P0 – API je funkčně rozbité proti vlastním testovacím očekáváním** (user management, role-based login flow, RBAC, SMTP integrační tok). To znamená, že i když image postavíte, runtime chování není konzistentní s očekáváním testů ani s bezpečnostním modelem role-based přístupu.
- **P0 – Deploy/verify vrstva není end-to-end ověřitelná v tomto prostředí** (`docker` CLI chybí), takže nelze potvrdit reálné nasazení stacku z těchto skriptů bez cílového hostu.
- **P1 – Dokumentace a provozní postupy jsou nejednotné** (část dokumentace tvrdí baseline „zelená“, ale aktuální testy API padají; navíc je vidět drift mezi očekáváním testů a implementací auth/users).
- **P1 – CI gate pro Playwright je v lokálním prostředí neproveditelná bez browser binárek** (ne funkcí aplikace, ale infrastrukturní závislost test runneru).

Dopad: současný stav není bezpečné označit jako „deploy-ready na hotel.hcasc.cz“.

---

## 3) Forenzní důkazy a pravděpodobné kořenové příčiny

## 3.1 API users/auth model drift (P0)

Pozorování:
- Endpoint `POST /api/v1/users` v `users.py` vytváří `PortalUser` s polem `role="manager"`, ale model `PortalUser` má relaci `roles` přes `portal_user_roles`, nikoliv sloupec `role`.
- Současně se při create neplní povinná pole `first_name` a `last_name` z payloadu konzistentně s modelem.
- V `auth.py` je při portal loginu používáno `user.role`, které na modelu neexistuje.

Praktický efekt:
- 500 Internal Server Error při toku kolem user managementu / portal loginu.
- Následně padají testy, které na těchto tocích stojí (`role selection`, `rbac`, části `reports/users`).

Kořenová příčina:
- **Nesoulad mezi datovým modelem (`PortalUser` + `PortalUserRole`) a route implementací (`users.py`, `auth.py`)**.

## 3.2 Neimplementovaný/rozpadlý multi-role flow vůči testům (P0)

Pozorování:
- Testy očekávají multi-role chování (uživatel s více rolemi, výběr active role, následné permission checky).
- Implementace auth vrací primitivní flow bez robustního napojení na `roles` relaci; chybí plně dotažený životní cyklus active role.

Praktický efekt:
- Selhání RBAC a role-selection scénářů.

Kořenová příčina:
- **RBAC kontrakt v testech je bohatší než aktuální runtime implementace auth/users**.

## 3.3 SMTP servisní tok není konzistentně integrován napříč endpointy (P0/P1)

Pozorování:
- Test očekává, že `admin hint`, `SMTP test email` a `user onboarding` používají jednotnou mail service vrstvu.
- Route `admin_hint` je zatím deterministický stub bez skutečné service integrace; users create flow také neposílá onboarding v konzistentní formě.

Praktický efekt:
- Selhání integračního testu mail service.

Kořenová příčina:
- **Nedokončené propojení service vrstvy do auth/users endpointů**.

## 3.4 Lokální gate `pnpm ci:gates` padá na chybějícím Playwright browseru (P1, environment)

Pozorování:
- CI gate padá na `Executable doesn't exist ... chromium_headless_shell`.

Praktický efekt:
- Bez instalace browser binárek nelze lokálně projít UI test gate.

Kořenová příčina:
- **Environment setup gap** (ne aplikační bug): chybí `pnpm exec playwright install` v prostředí.

## 3.5 Deploy verify script neproběhne bez Docker runtime (P1, environment)

Pozorování:
- `infra/verify/verify-deploy.sh` končí `docker: command not found`.

Praktický efekt:
- V tomto auditu nelze potvrdit skutečný container deploy flow na úrovni runtime.

Kořenová příčina:
- **Auditní prostředí bez Docker CLI/daemonu**.

## 3.6 Riziko driftu mezi „manifest/test očekávání“ a runtime implementací (P1)

Pozorování:
- Manifest a testy nastavují přísná, vymahatelná pravidla (SSOT, WCAG, signage, role behavior).
- API část je v aktuálním snapshotu s tímto kontraktem v rozporu.

Praktický efekt:
- I když projde část build/deploy pipeline, výsledek není ve stavu „bez problémů“.

---

## 4) Forenzní TODO list (co změnit a jak), aby šel build/deploy/release bez problémů

## P0 – nutné před jakýmkoliv produkčním nasazením

1. **Srovnat datový model a route implementaci pro Portal uživatele**
   - Kde: `apps/kajovo-hotel-api/app/api/routes/users.py`, `apps/kajovo-hotel-api/app/api/routes/auth.py`, `apps/kajovo-hotel-api/app/db/models.py`.
   - Co změnit:
     - odstranit používání neexistujícího `user.role`/`role=`;
     - create/update user napojit na `PortalUserRole` relaci;
     - vracet `roles` konzistentně podle DB.
   - Akceptace:
     - zelené: `test_auth_role_selection.py`, `test_rbac.py`, `test_users.py`, `test_reports.py`.

2. **Dopsat plný multi-role auth flow**
   - Kde: `auth.py`, případně nové route + helpery.
   - Co změnit:
     - login musí vrátit role set uživatele;
     - pokud má uživatel >1 roli, vynutit výběr `active_role` před přístupem na modulové endpointy;
     - implementovat endpoint pro volbu active role a perzistenci do session cookie.
   - Akceptace:
     - role-selection scénáře + RBAC matrix musí být zelené.

3. **Zintegrovat mail service jednotně**
   - Kde: `app/api/routes/auth.py`, `app/api/routes/users.py`, `app/api/routes/settings.py`, `app/services/mail.py`.
   - Co změnit:
     - `admin_hint` a onboarding po vytvoření uživatele volat přes `build_email_service`;
     - sjednotit payloady/předměty emailů dle testů.
   - Akceptace:
     - zelený `test_smtp_email_service.py`.

4. **Stabilizovat admin lockout/logiku proti testům**
   - Kde: `auth.py` + případně service/repository pro `auth_lockout_states`.
   - Co změnit:
     - login číst lockout stav, vracet generickou odpověď, správně odemykat po resetu stavu.
   - Akceptace:
     - zelený `test_auth_lockout.py`.

## P1 – nutné pro spolehlivý release proces

5. **Sjednotit CI prostředí pro Playwright**
   - Kde: CI pipeline + onboarding dokumentace.
   - Co změnit:
     - explicitně přidat krok `pnpm exec playwright install --with-deps` (nebo image s preinstalled browsery).
   - Akceptace:
     - `pnpm ci:gates` běží reprodukovatelně na CI runneru.

6. **Zpřesnit deploy runbook pro hotel.hcasc.cz**
   - Kde: `docs/how-to-deploy.md`, `docs/cutover-runbook.md`, `infra/ops/deploy-production.sh`.
   - Co změnit:
     - explicitně popsat síť `deploy_hotelapp_net`, DB endpoint, rollback sekvenci, post-deploy smoke;
     - doplnit „hard fail“ checky na přítomnost `docker` + `docker compose` + dostupnost externí sítě;
     - doplnit kontrolu, že deploy běží na správném branch/tag commit SHA.
   - Akceptace:
     - 1-click runbook verifikovaný na staging i production dry-runu.

7. **Srovnat tvrzení v dokumentaci s realitou testů**
   - Kde: dokumenty typu deploy summary / forensic baseline.
   - Co změnit:
     - odstranit/aktualizovat historická tvrzení „vše zelené“, pokud neplatí pro aktuální HEAD;
     - přidat datované verze výsledků + přesné commit SHA.
   - Akceptace:
     - žádný rozpor mezi „status dokumentem“ a skutečným test runem.

## P2 – doporučené pro dlouhodobou robustnost

8. **Doplnit kontraktní test pro users/auth schema drift**
   - Co změnit:
     - test, který explicitně validuje mapování DB modelu (`PortalUser.roles`) na API response/login session.

9. **Zavést release gate „deploy-ready“**
   - Co změnit:
     - release je povolen jen pokud projde: API test suite, web gate suite, smoke against deployed URL, verify script.

10. **Automatizovat auditní report po nasazení**
    - Co změnit:
      - generovat artifact s verzí, health, smoke, RBAC sanity, WCAG gate výsledky.

---

## 5) Doporučené pořadí opravy (kritická cesta)

1) Opravit users/auth model drift (P0)  
2) Opravit multi-role flow + RBAC (P0)  
3) Opravit SMTP integrační body (P0/P1)  
4) Dotáhnout lockout flow (P0/P1)  
5) Teprve potom znovu validovat `pnpm ci:gates` + API testy + deploy verify na hostu s Dockerem  
6) Aktualizovat runbook + status dokumenty dle reálného výsledku

---

## 6) Verdikt

Aktuální stav lze částečně buildnout, ale **není ve stavu „bez problémů build/deploy/nasadit“** na `hotel.hcasc.cz`, protože klíčová API doména (auth/users/RBAC/mail integrace) je v rozporu s testovacími očekáváními a provozním kontraktem. Nejprve je potřeba projít výše uvedené P0/P1 kroky, potom opakovat release kandidátní validaci.
