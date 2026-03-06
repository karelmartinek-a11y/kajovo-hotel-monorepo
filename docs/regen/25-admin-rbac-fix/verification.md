# A) Cíl
- Opravit admin RBAC tak, aby role admin měla přístup k modulu Přehled a navázaným modulům.

# B) Exit criteria
- Admin účet nevidí „Přístup odepřen“ na Přehledu.
- CI guardrails `ci:verification-doc` projde.

# C) Změny
- Doplnění `dashboard:read` do admin permissions (web/admin + backend).

# D) Ověření
- `pnpm --filter @kajovo/kajovo-hotel-admin test -- tests/rbac-access.spec.ts`

# E) Rizika/known limits
- Žádná změna business logiky; pouze oprávnění.

# F) Handoff pro další prompt
- Po zelených checkách mergnout PR a spustit deploy.
