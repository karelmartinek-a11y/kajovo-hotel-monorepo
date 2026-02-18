# RBAC (Role-Based Access Control)

## Role model

RBAC uses `x-user-role` request header and the following operational roles:

- **Reception** (`reception`): breakfast, lost & found, issues, read reports.
- **Maintenance** (`maintenance`): issues module and report read access.
- **Warehouse** (`warehouse`): inventory module and report read access.
- **Manager** (`manager`): full operational access across all modules.
- **Admin** (`admin`): full operational access across all modules.

If role is missing or unknown, API and web fallback to `manager`.

## Permission matrix

Permissions use `<module>:<action>` where action is `read` or `write`.

| Module | Reception | Maintenance | Warehouse | Manager | Admin |
|---|---|---|---|---|---|
| dashboard | read | read | read | read/write* | read/write* |
| breakfast | read/write | - | - | read/write | read/write |
| lost_found | read/write | - | - | read/write | read/write |
| issues | read/write | read/write | - | read/write | read/write |
| inventory | - | - | read/write | read/write | read/write |
| reports | read | read | read | read/write | read/write |

`*` dashboard currently has read use case only.

## API enforcement

- All `/api/v1/<module>` routers enforce module-level RBAC.
- `GET`/read operations require `<module>:read`.
- `POST`/`PUT`/`PATCH`/`DELETE` operations require `<module>:write`.
- Authorization failure returns `403` with detail in format `Missing permission: <module>:<action>`.

## Auditability

All write requests under `/api/v1/*` are persisted in `audit_trail`, including denied writes (`403`), with actor identity:

- `actor` (display name)
- `actor_id`
- `actor_role`
- `request_id`, module, method/action, resource, status code, payload snippet, timestamp

Identity source order:

1. `x-user-id`
2. `x-user`
3. `x-forwarded-user`
4. fallback `anonymous`

Role source:

- `x-user-role` (normalized to known roles), fallback `manager`.

## Web behavior

Web resolves auth profile from:

1. test hook `window.__KAJOVO_TEST_AUTH__` (for e2e)
2. URL token `access_token` (base64-encoded JSON payload)
3. fallback defaults

Token payload format:

```json
{
  "userId": "maint-4",
  "role": "maintenance",
  "permissions": ["issues:read", "issues:write", "reports:read"]
}
```

Navigation (`ia.json` + permissions) hides modules without required `read` permission, and direct route access shows a finished **Přístup odepřen** screen.
