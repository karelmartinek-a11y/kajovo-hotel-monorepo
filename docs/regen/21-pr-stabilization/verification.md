# A) Cíl
- Stabilizovat API auth/users toky, aby opět prošly CI gate testy (verification doc, unit, e2e smoke).

# B) Exit criteria
- `pnpm ci:verification-doc` projde.
- Cílené API testy pro lockout, role selection, RBAC a SMTP service projdou.

# C) Změny
- Doplněna podpora multi-role login/select-role a lockout kontroly v `auth` routách.
- Opraveno vytváření portal uživatele přes `PortalUserRole` relaci + onboarding email service hook.
- Přidán tento verification dokument požadovaný CI guardrailem.

# D) Ověření
- Lokálně spuštěny cílené pytest testy pro selhávající scénáře.

# E) Rizika/known limits
- Lockout logika je zde jen read-path kontrola `locked_until`; plné inkrementace/odemykání zůstávají mimo scope této opravy.

# F) Handoff pro další prompt
- Pokud CI ještě selže, pokračovat podle konkrétního job logu z `CI Gates` (primárně `unit-tests` nebo `e2e-smoke`) a držet změny minimální.
