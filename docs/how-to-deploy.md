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

Production deploy is workflow_dispatch with deploy_sha and review_pr. check_release_review.py requires current main, the latest successful exact-main CI Gates, CI Full and CI Release runs, the merged release PR, and content-bound Independent Codex multi-agent forensic review. Six distinct reviewers A–F cover cumulative resulting trees of both repositories with zero open CRITICAL/HIGH/MEDIUM findings. Paid external bot reviews are not a release dependency; this evidence is not human review.

Signing material originates only at /etc/home-assistant-mcp/signing.key. Root MCP provisioning preserves it and hands it to the existing private persisted hotel env. The deploy adapter compares the preserved key against the root-published SHA256 fingerprint before restarting API; it never uploads a GitHub signing key. Neither key nor fingerprint is logged.

The root-owned coordinator in [agentha scripts/cutover.py](https://github.com/karelmartinek-a11y/agentha/blob/main/scripts/cutover.py), validated by cumulative independent forensic review, owns rollback and final cleanup. Hotel deploy must run within its active acceptance deadline. It starts the new temporary private process on 18103 and runs authenticated SDK initialize/list_tools plus search_devices(name="recepce"), get_device_state and repeated search in one SDK session before route cutover. Rollback source, image anchors and server configs remain until new hotel runtime, native Realtime MCP import and canonical read acceptance all pass. Any failure or acceptance deadline automatically restores the previous processes, routes and hotel images. Cleanup occurs only after PASS. Production evidence logs contain aggregate counts and PASS categories only.

The coordinator persists an absolute systemd calendar deadline with Persistent=true. It snapshots actual hotel image IDs and routes before publication, anchors rollback images, and invokes automatic restoration on failure or missed deadline. Root finalization rechecks exact hotel/MCP SHA, actual injected signing-key fingerprints, canonical SDK auth/search and external aggregate Realtime/voice evidence before cleanup. The coordinator also invokes this repository's `scripts/cleanup_accepted_release.py` after acceptance to prune obsolete hotel releases/images; normal deploy never does this early.

Root control records are stored under /var/lib/home-assistant-mcp-control (root-only), outside service-writable registry/receipt data. The canonical fingerprint used by hotel is /etc/home-assistant-mcp-public/signing-key.sha256 (root-owned read-only file and parent), so the service cannot replace it.

The root coordinator serializes preparation, activation, rollback and acceptance. A root-owned systemd worker runs the exact hotel release as deploy-hotel, and SSH preparation only signals readiness. Both share the runtime fence. Rollback revokes the transaction, stops its entire process group, acquires the fence and restores exact archived images; a late build cannot republish after recovery. A worker failure also triggers rollback.

Final acceptance checks the deadline under the coordinator lock before recording accepted_cleanup_pending. Cleanup retries preserve accepted runtime and canonical persistent data. Obsolete sources, configs and backup generations are deleted after acceptance; accepted is recorded after successful cleanup.
