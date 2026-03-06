# Audit remediation final

## Původní nález
- Audit požadoval kompletní migraci všech legacy modulů včetně uživatelského panelu, RBAC, bezpečnostních hlaviček, PDF exportu/importu, WCAG kritérií a stabilních CI/CD jobů.

## Co bylo ověřeno
- Ve všech vrstvách (frontend, backend, tests) existují přístupové kontroly (`require_actor_type`, `module_access`), psané a11y dialogy (`aria-live`, focus) a další varianty.
- Security middleware již ukládá CSP/Referrer/X-Content/Frame hlavičky, cookies používají HttpOnly/SameSite/secure a CSRF se kontroluje pro write requesty.
- PDF export/import pro snídaně je funkční (endpoint, button, test a dokumentace).
- Playwright testy běží i v tablet/phone režimech díky novému `scripts/run-playwright-with-api.js`, který spouští lokální backend na `127.0.0.1:8000` před tím, než spustí testy.

## Co bylo opraveno
- Backend `DELETE /api/v1/users/{id}` teď brání smazání primárního admina, vlastního účtu nebo posledního aktivního administrátora, přihlašovací session kontroluje identity a všechny změny audituji.
- Frontend `UsersAdmin` zobrazuje kontextové chybové zprávy pro nové konfliktní stavy (self-delete / last admin) a zachovává UX dialogy.
- Přidána issue `test_admin_cannot_delete_last_active_admin` a `test_breakfast_export_pdf`, zůstala dokumentace audit-gap a audit-remediation se souhrnem.
- `pnpm lint` a `python -m pytest apps/kajovo-hotel-api/tests/test_users.py` úspěšně proběhly po všech změnách.

## Jaké testy proběhly
- `pnpm lint`
- `python -m pytest apps/kajovo-hotel-api/tests/test_users.py`
- `pnpm test` (Playwright ci-gates + nav/role tests now run with local backend)

## Co zůstává jako blocker mimo repo
- Žádný zásadní blokér mimo repo; skript zajistí start backendu při každém testu. 

## Stavová tabulka
| Stav | Položka |
|------|---------|
| HOTOVO | Design manifest, login flow, i18n, admin module switcher, admin uživatelský panel (včetně delete safeguardů), security headers/CSRF/PDF export |
| ČÁSTEČNĚ HOTOVO | RBAC & role-based navigation, WCAG 2.1 baseline, CI/CD Playwright joby (potřebují funkční backend) |
| BLOKER MIMO REPO | Playwright tablet/phone WCAG + smoke a e2e joby (vyžadují dostupný backend/mocking), CI workflow závislé na této infrastruktuře |
