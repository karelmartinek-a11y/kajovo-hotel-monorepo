# A) Cíl
Zajistit zpětnou kompatibilitu admin loginu – umožnit aplikaci načítat administrátorské údaje i z původních (legacy) proměnných prostředí HOTEL_ADMIN_EMAIL a HOTEL_ADMIN_PASSWORD, nejen z nových KAJOVO_API_ADMIN_EMAIL a KAJOVO_API_ADMIN_PASSWORD.

# B) Exit criteria
- Admin login funguje při zadání pouze legacy proměnných.
- Testy pro načtení údajů skrz HOTEL_* úspěšně proběhnou.
- Změny neruší čtení nových proměnných KAJOVO_API_*.

# C) Změny
- Úprava apps/kajovo-hotel-api/app/config.py: Field(validation_alias=AliasChoices(...))
- Doplnění testů do tests/test_config.py.
- Úprava infra/compose.prod.yml – nastavení pro HOTEL_ADMIN_EMAIL/PASSWORD.

# D) Ověření
- Ručně otestovat přihlášení admin účtem s legacy proměnnými.
- Spustit automatizované testy (pytest tests/test_config.py).
- CI musí projít bez chyb.

# E) Rizika/known limits
- Riziko překlepu v názvech proměnných.
- Deploymenty bez nových proměnných budou fungovat pouze na novém kódu.

# F) Handoff pro další prompt
Při dalších změnách v konfiguračních proměnných udržovat zpětnou kompatibilitu a aktualizovat testy.