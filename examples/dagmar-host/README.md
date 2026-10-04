# Dagmar minimal host (test auth only)

Copy `packages/{voice-core,voice-core-server,dagmar-browser,dagmar-server}` and this
host into a clean directory. The complete executable proof is
`python3.11 scripts/verify_dagmar_diagnostics_copy_out.py`; it creates a separate
venv/node_modules and never copies hotel sources. Keep a workspace manifest listing
`packages/*` and `examples/dagmar-host`.

Install the two Python packages and uvicorn in your venv, then run:

```
pnpm install
pnpm --filter dagmar-minimal-host build
python -m uvicorn server:app --app-dir examples/dagmar-host --host 127.0.0.1 --port 8008
pnpm --filter dagmar-minimal-host dev
```

`DAGMAR_DATA` selects a disposable test data directory. `DAGMAR_DB_URL` can select
an empty PostgreSQL database; own migrations run without hotel Alembic. The browser
uses `/dagmar` and `/dagmar-memory` host mappings. Authentication is the test-only
`test-admin-a`/`test-admin-b` adapter, not another production login. Mutating test
requests require `x-test-csrf: dagmar-test-only`; this host must stay on loopback.
Its deterministic encryption keys are public fixtures and must never protect
production content. Default provider is a protocol mock and performs no paid call.

The opt-in `native_acceptance.py` host is a separate real-provider test harness.
It refuses normal CI, requires a backend key on stdin and reserves the shared
paid-budget ledger before setup. Its MCP clients are isolated public-contract
fakes. Current results and missing usage are in `docs/dagmar/IMPLEMENTATION.md`;
starting that host does not authorize real SMTP/device writes or exceed the ledger.
