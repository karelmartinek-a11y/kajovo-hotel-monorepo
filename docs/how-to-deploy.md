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

Production deployment is selected by a successful exact-main CI Gates run, an authenticated `coordinated-release-ready` repository dispatch, a ten-minute scheduled readiness observer, or manual workflow dispatch. The observer checks GitHub's successful **actual deployment job** marker first; a green readiness job is never evidence of deployment or coordinated acceptance. It does not rebuild or rerun CI. A completed runtime deployment of the same hotel SHA is skipped by the scheduled observer. Explicit dispatch rechecks the transaction instead of bypassing this check; the managed worker consumes its upload readiness marker on exit so subsequent transactions require fresh preparation.

`check_release_review.py` requires current main, its latest completed successful CI Gates run and the applicable content-bound independent review. It emits the exact CI run ID and the reviewed MCP SHA. Trusted main code executes this gate before candidate checkout or production credential injection. Preparation downloads the successful gate's SHA-bound scope artifact: the deploy_required flag describes code impact, not runtime acceptance. Every candidate retains verified restoration images, and preparation always checks current root readiness, including documentation-only changes. Historical GitHub job success cannot substitute for final root acceptance or prevent restoration after a later rollback. Before the first SSH operation, the configured address must resolve solely to the approved production IPv4. A single read checks the root-published transaction: phase `active`, exact hotel SHA, exact **reviewed MCP SHA**, worker not already complete, and an armed rollback timer. If the transaction is not READY, the actual deployment job is skipped immediately; no runner waits thirty minutes for preflight. The next observer or readiness event checks again. GitHub schedules can be delayed; ten minutes is the nominal interval, not a deadline guarantee.

The coordinator may dispatch readiness immediately after its successful activation without any mandatory external code change; the periodic observer provides automatic fallback. A caller with existing authorized GitHub credentials can send:

```sh
gh api --method POST repos/karelmartinek-a11y/kajovo-hotel-monorepo/dispatches \
  -f event_type=coordinated-release-ready \
  -f 'client_payload[deploy_sha]=<exact current main SHA>' \
  -f 'client_payload[mcp_sha]=<exact reviewed MCP SHA>'
```

The event is only a wake-up signal; it cannot assert readiness, bypass CI/review, choose another MCP revision, or inject production credentials. The server-owned transaction and timer are checked again before upload and under the runtime fence before publication. Production deployment concurrency never cancels an active cutover. CI validation of superseded revisions is cancelled separately.

## Immutable production image bundle

The authoritative `api-runtime-image` job builds API, web and admin once on `linux/amd64` with independent Docker GHA caches. It executes the API imports and the real host/frontend/API proxy test against the **same immutable image IDs** exported for production. `release-images-<SHA>` contains `manifest.json` and `images.tar.gz`, retained for seven days. The strict manifest binds source SHA, architecture, all three image tags and IDs, successful checks and SHA256 of the whole exported archive. Docker image IDs are SHA256 configuration content digests, not registry manifest digests.

Deployment downloads the bundle only from the exact successful Gates run ID, verifies its hash before production credentials, streams it to the server without buffering a gigabyte in memory, and verifies it again before signaling the worker. The root-managed worker imports and validates the actual image IDs **before stopping any current container**. Its generated Compose override uses those IDs with `pull_policy: never`; production `up` always specifies `--no-build`. There is no remote-build fallback. Missing or expired artifacts require a fresh full CI run for the same current main SHA. The runtime artifact and subsequent server verification compare the running Docker image IDs with the tested manifest.

Deployment runs live browser checks in the version-matched Playwright image rather than installing browser/system dependencies repeatedly. Browser/package mismatch fails explicitly. GitHub stores CI failure traces/reports; live production smoke keeps aggregate evidence and avoids storing secrets, transcripts or request bodies.

Uploaded source archives are removed after extraction. Source releases and captured rollback images stay protected throughout the transaction. Age-bounded Docker build-cache maintenance (`until=168h`, `--keep-storage 2GB`) runs only during accepted cleanup, outside the deployment critical path; runtime images and database/media volumes are not cache prune inputs.

Signing material originates only at /etc/home-assistant-mcp/signing.key. Root MCP provisioning preserves it and hands it to the existing private persisted hotel env. The deploy adapter compares the preserved key against the root-published SHA256 fingerprint before restarting API; it never uploads a GitHub signing key. Neither key nor fingerprint is logged.

The root-owned coordinator in [agentha scripts/cutover.py](https://github.com/karelmartinek-a11y/agentha/blob/main/scripts/cutover.py), validated by cumulative independent forensic review, owns rollback and final cleanup. Hotel deploy must run within its active acceptance deadline. It starts the new temporary private process on 18103 and runs authenticated SDK initialize/list_tools plus search_devices(name="recepce"), get_device_state and repeated search in one SDK session before route cutover. Rollback source, image anchors and server configs remain until new hotel runtime, native Realtime MCP import and canonical read acceptance all pass. Any failure or acceptance deadline automatically restores the previous processes, routes and hotel images. Cleanup occurs only after PASS. Production evidence logs contain aggregate counts and PASS categories only.

The coordinator persists an absolute systemd calendar deadline with Persistent=true. It snapshots actual hotel image IDs and routes before publication, anchors rollback images, and invokes automatic restoration on failure or missed deadline. Root finalization rechecks exact hotel/MCP SHA, actual injected signing-key fingerprints, canonical SDK auth/search and external aggregate Realtime/voice evidence before cleanup. The coordinator also invokes this repository's `scripts/cleanup_accepted_release.py` after acceptance to prune obsolete hotel releases/images; normal deploy never does this early.

Root control records are stored under /var/lib/home-assistant-mcp-control (root-only), outside service-writable registry/receipt data. The canonical fingerprint used by hotel is /etc/home-assistant-mcp-public/signing-key.sha256 (root-owned read-only file and parent), so the service cannot replace it.

The root coordinator serializes preparation, activation, rollback and acceptance. A root-owned systemd worker runs the exact hotel release as deploy-hotel, and SSH preparation only signals readiness. Both share the runtime fence. Rollback revokes the transaction, stops its entire process group, acquires the fence and restores exact archived images; a late build cannot republish after recovery. A worker failure also triggers rollback.

Final acceptance checks the deadline under the coordinator lock before recording accepted_cleanup_pending. Cleanup retries preserve accepted runtime and canonical persistent data. Obsolete sources, configs and backup generations are deleted after acceptance; accepted is recorded after successful cleanup.
