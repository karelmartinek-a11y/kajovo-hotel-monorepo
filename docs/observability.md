# Observability

## API logging

API emits structured JSON logs for every request with these fields:
- `request_id` (from `x-request-id` header or generated UUID)
- `user` (from `x-user`, `x-user-id`, or `x-forwarded-user`, fallback `anonymous`)
- `module` (derived from `/api/v1/<module>/...` path)
- `status`
- `latency_ms`
- `method`, `path`, timestamp metadata

Use this to quickly correlate one request across API logs and audit records.

## Health endpoints

- `GET /health`: lightweight process check.
- `GET /ready`: readiness check including database query (`SELECT 1`).

Use `/health` for liveness and `/ready` for traffic readiness checks.

## Audit trail

Write operations (`POST`, `PUT`, `PATCH`, `DELETE`) under `/api/v1/*` are stored in `audit_trail` table with:
- request ID
- actor
- module
- action
- resource path
- response status code
- captured payload snippet (up to 2k chars)
- timestamp

Typical query:

```sql
SELECT created_at, actor, module, action, resource, status_code
FROM audit_trail
ORDER BY id DESC
LIMIT 50;
```

## Web client error boundary

The web app wraps routes in a client-side error boundary:
- logs errors to browser console (`client.error_boundary`)
- optionally POSTs JSON payload to endpoint defined by `window.__KAJOVO_ERROR_ENDPOINT__`

This helps capture unexpected runtime rendering errors without white-screening users.

## Docker Compose healthchecks

- API healthcheck uses `/ready`.
- Web healthcheck uses `/healthz` in nginx.

In development and production compose files, `web` depends on healthy `api`.

## Debug playbook

1. Check container health:
   - `docker compose -f infra/dev-compose.yml ps`
2. Check API readiness manually:
   - `curl -i http://localhost:8000/ready`
3. Inspect latest request logs:
   - `docker compose logs api --tail=200`
4. Inspect audit trail for recent writes:
   - `SELECT ... FROM audit_trail ORDER BY id DESC LIMIT ...`
5. Reproduce web issue and inspect browser console for `client.error_boundary` entries.
