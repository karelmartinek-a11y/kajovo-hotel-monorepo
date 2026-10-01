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

## Coordinated native MCP release

Production deploy is workflow_dispatch with deploy_sha and review_pr. check_release_review.py requires current main, successful main CI Gates and a completed review on the PR head; PR #122 and the release PR must have every thread resolved. CI success is independent of review acceptance.

Signing material originates only at /etc/home-assistant-mcp/signing.key. Root MCP provisioning preserves it and hands it to the existing private persisted hotel env. The deploy adapter compares the preserved key against the root-published SHA256 fingerprint before restarting API; it never uploads a GitHub signing key. Neither key nor fingerprint is logged.

The MCP coordinator starts the new private process and runs authenticated SDK initialize/list_tools plus read-only search_devices(name="recepce") before route cutover. Rollback source, image anchors and server configs remain until new hotel runtime, native Realtime MCP import and canonical read acceptance all pass. Any failure or acceptance deadline automatically restores the previous processes, routes and hotel images. Cleanup occurs only after PASS. Production evidence logs contain aggregate counts and PASS categories only.
