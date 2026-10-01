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

The root-owned coordinator in [agentha scripts/cutover.py](https://github.com/karelmartinek-a11y/agentha/blob/main/scripts/cutover.py), reviewed in agentha PR #4, owns rollback and final cleanup. Hotel deploy must run within its active acceptance deadline. It starts the new temporary private process on 18103 and runs authenticated SDK initialize/list_tools plus read-only search_devices(name="recepce") before route cutover. Rollback source, image anchors and server configs remain until new hotel runtime, native Realtime MCP import and canonical read acceptance all pass. Any failure or acceptance deadline automatically restores the previous processes, routes and hotel images. Cleanup occurs only after PASS. Production evidence logs contain aggregate counts and PASS categories only.

The coordinator persists an absolute systemd calendar deadline with Persistent=true. It snapshots actual hotel image IDs and routes before publication, anchors rollback images, and invokes automatic restoration on failure or missed deadline. Root finalization rechecks exact hotel/MCP SHA, actual injected signing-key fingerprints, canonical SDK auth/search and external aggregate Realtime/voice evidence before cleanup. The coordinator also invokes this repository's `scripts/cleanup_accepted_release.py` after acceptance to prune obsolete hotel releases/images; normal deploy never does this early.
