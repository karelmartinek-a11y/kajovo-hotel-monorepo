# Verification

## Change summary
- Added missing `roles` and `activeRole` to auth fallback objects in both admin and web apps to satisfy `AuthProfile` and keep UI bootstrap resilient when `/api/auth/me` fails.
- Updated web RBAC Playwright assertion to match the current access denied copy in a less brittle way.
- Updated API RBAC tests to include CSRF headers for authenticated requests.
- Updated SMTP onboarding test to provide required `PortalUserCreate` fields (`first_name`, `last_name`, `roles`).

## How verified
- `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- `pnpm --filter @kajovo/kajovo-hotel-web lint`
- `pytest apps/kajovo-hotel-api/tests/test_rbac.py apps/kajovo-hotel-api/tests/test_smtp_email_service.py`

## Notes
- Changes are focused on fallback/auth test-path behavior and API test fixture compatibility with current schema/CSRF requirements.
