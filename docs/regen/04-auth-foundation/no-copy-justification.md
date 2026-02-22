# No-copy justification (04-auth-foundation)

V tomto kroku nebyl kopírován UI/CSS/JS ani business flow z `legacy/**`.
Použit byl pouze guided port požadovaného DB konceptu `PortalUser` (email=username, role, password_hash, is_active)
do nového SQLAlchemy modelu a migrace, aby byl splněn parity požadavek auth foundation.
