# SSOT scope and status

## Autorita

- Produkční zdrojový kód, aktivní workflow a ověřený runtime jsou nejvyšší zdroj pravdy.
- Current-state dokumentace v `docs/` popisuje jen aktivní web, admin, API, CI a deploy řetězec.
- Pokud se dokumentace rozchází s kódem nebo runtime, opravuje se dokumentace, ne funkční produkční kód.

## Závazné current-state soubory

- `docs/SSOT_CURRENT.md`
- `docs/current-state-manifest.yaml`
- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/rbac.md`
- `docs/how-to-run.md`
- `docs/testing.md`
- `docs/voice-core.md`
- `docs/how-to-deploy.md`
- `docs/ci-gates.md`
- `docs/release-checklist.md`

## Mimo rozsah

- Historické audity, cutover plány, migrační poznámky a jednorázové reporty nejsou current-state autorita.
- Android release chain, APK workflow a parity pravidla nejsou součástí aktivního webového provozu.

Voice Core ukládá ciphertext pod samostatným `KAJOVO_API_VOICE_MASTER_KEY`. Volitelný stejnojmenný GitHub secret se přenáší pouze do API runtime; chybějící hodnota nepřepisuje existující serverový master klíč. Jeho změna vyžaduje opětovné zadání OpenAI klíče nebo naplánovanou migraci ciphertextu. Pouhé vytvoření pracovní větve funkci nenasazuje; hlasový smoke v CI není placený. Viz [Voice Core](voice-core.md).


## Automatický API/admin deploy

Úspěšný push CI pro stále aktuální `main` spouští GitHub deploy. Trailer
`Hotel-Deploy-Scope: api-admin` omezuje výměnu na API/admin bez restartu webu,
PostgreSQL nebo ostatních služeb. Úplný chráněný snapshot používá stávající
Docker přístup deploy účtu, bez změny sudo, skupin, ACL či práv konfigurace.
Přesný mechanismus, odmítnuté stavy a matice dopadů jsou v
[DEPLOY_AUTOMATION.md](DEPLOY_AUTOMATION.md).

Pomocný nespouštěný snapshot kontejner přepisuje zděděné Compose project/service labely na prázdné; výměna API jej nesmí převzít ani odstranit. Docker test ověřuje skutečnou Compose výměnu i GC.
