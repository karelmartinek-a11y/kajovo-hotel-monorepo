# 19-ci-fix verification

## A) Cíl
- Opravit aktuální CI pád po merge změn v auth/users toku bez zbytečných změn mimo padlé kroky.

## B) Exit criteria
- `pnpm ci:verification-doc` projde.
- API auth/users testy přestanou padat na `PortalUser(role=...)` chybě.
- Smoke flow admin hint + user create + portal login zůstane průchozí.

## C) Změny
- Opraveno vytváření portal uživatele na aktuální model s `roles` relací.
- Doplněno serializování rolí uživatele v API odpovědích.
- Doplněny auth endpointy o práci s `roles/active_role`, výběr role a lockout kontrolu.
- Doplněn `admin_hint` tok o jednotné použití `build_email_service`.
- Upraven smoke test očekávající legacy `role: manager` na aktuální `roles`.

## D) Ověření
- PASS: `python -m pytest apps/kajovo-hotel-api/tests/test_users.py::test_admin_can_crud_and_portal_login -q`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests/test_smtp_email_service.py::test_hint_test_email_and_onboarding_use_single_email_service -q`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests/test_auth_role_selection.py::test_multi_role_user_must_select_active_role -q`

## E) Rizika/known limits
- Oprava je cílená na auth/users regresi; neřeší širší refactoring auth domény.
- V CI může být nutné znovu validovat celý unit běh kvůli závislostem mezi testy.

## F) Handoff pro další prompt
- Pokud by zůstaly flaky testy, další krok má cílit jen na konkrétní padlý test a nerefactorovat celé auth API.
