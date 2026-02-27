# Parity PR plán (navazující kroky)

1. **regen/01-contract-foundation**  
   Zafixovat jednotný contract SSOT (routes/endpoints/rbac matrix) pro web+api.  
   Ověření: diff proti `parity-map.yaml`, lint docs.

2. **regen/02-api-auth-foundation**  
   Zavést robustní auth vrstvy (admin session, portal auth, device identity) bez legacy kódu.  
   Ověření: API unit testy auth guardů.

3. **regen/03-api-device-provisioning**  
   Implementovat device provisioning handshake parity (register/status/challenge/verify).  
   Ověření: integrační testy kryptografického flow.

4. **regen/04-api-reports-media**  
   Implementovat reports/media workflow parity včetně polling endpointu.  
   Ověření: CRUD+workflow+media testy.

5. **regen/05-api-breakfast-import**  
   Implementovat breakfast import pipeline (config, fetch trigger, day snapshot, check/note).  
   Ověření: testy parseru + scheduler + endpointy.

6. **regen/06-api-inventory-cards**  
   Implementovat inventory ingredient + stock cards + audit recompute.  
   Ověření: testy pohybů IN/OUT/adjust a auditní konzistence.

7. **regen/07-web-app-shell-brand**  
   Přepsat web app shell dle ManifestDesignKájovo + signace vlevo dole + responsive nav.  
   Ověření: Playwright brand gate + screenshoty.

8. **regen/08-web-auth-portal**  
   Přepsat login/forgot/reset/portal toky v čisté implementaci.  
   Ověření: e2e tok login-reset.

9. **regen/09-web-admin-reports**  
   Přepsat admin reports list/detail/workflow/media.  
   Ověření: e2e přepnutí stavu + media preview.

10. **regen/10-web-admin-breakfast**  
    Přepsat admin breakfast UI a import/denní operace.  
    Ověření: e2e import/check/note flow.

11. **regen/11-web-admin-inventory**  
    Přepsat inventory UI (ingredients/stock/movements/cards).  
    Ověření: e2e create card + stock recompute.

12. **regen/12-rbac-hardening**  
    Uzamknout role gating web+api včetně direct URL deny a API forbidden scénářů.  
    Ověření: Playwright RBAC + API RBAC test suite.

13. **regen/13-parity-uat-cutover**  
    Spustit UAT checklist, parity matrix, release candidate a cutover runbook update.  
    Ověření: aktualizované docs + průchod CI gates.
