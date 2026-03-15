# RBAC

## Current auth source

RBAC is session-backed.

- Browser clients authenticate through `/api/auth/login` or `/api/auth/admin/login`.
- API identity is loaded from the server-side session store via `require_session`.
- Web and admin frontends resolve identity through `/api/auth/me`.
- Missing or invalid session does **not** fall back to a local pseudo-user.

This replaces older header-driven and local pseudo-user behavior described in historical documents.

## Actor types

There are two actor types:

- `admin`
- `portal`

`admin` sessions always operate as role `admin`.

`portal` sessions may carry multiple roles. If more than one role is assigned, the user must select an active role before guarded module access is allowed.

## Canonical roles

Canonical backend roles are:

- `admin`
- `pokojska`
- `udrzba`
- `recepce`
- `snidane`
- `sklad`

Aliases such as `housekeeping`, `maintenance`, `reception`, `breakfast` and `warehouse` are normalized to the canonical Czech role set in backend and frontend helpers.

## Permission matrix

Permissions use `<module>:<action>` and are defined in `apps/kajovo-hotel-api/app/security/rbac.py`.

### admin

- `dashboard:read`
- `housekeeping:read`
- `breakfast:read`, `breakfast:write`
- `lost_found:read`, `lost_found:write`
- `issues:read`, `issues:write`
- `inventory:read`, `inventory:write`
- `reports:read`, `reports:write`
- `users:read`, `users:write`
- `settings:read`, `settings:write`

### pokojska

- `housekeeping:read`
- `breakfast:read`, `breakfast:write`
- `issues:read`, `issues:write`
- `inventory:read`, `inventory:write`
- `lost_found:read`, `lost_found:write`

### udrzba

- `issues:read`, `issues:write`

### recepce

- `breakfast:read`, `breakfast:write`
- `lost_found:read`, `lost_found:write`

### snidane

- `breakfast:read`, `breakfast:write`
- `inventory:read`, `inventory:write`
- `issues:read`, `issues:write`

### sklad

- `breakfast:read`, `breakfast:write`
- `inventory:read`, `inventory:write`
- `issues:read`, `issues:write`

## API enforcement

- Module routers use `require_permission`, `require_module_access`, or `require_actor_type`.
- Read requests map to `:read`.
- `POST`, `PUT`, `PATCH`, `DELETE` map to `:write`.
- Missing permission returns `403` with `Missing permission: <module>:<action>`.
- Missing active role on a multi-role portal session returns `403` with `Active role must be selected`.

## Session lifecycle and revocation

RBAC depends on the session store in `auth_sessions`.

- Login creates a server-side session record.
- Logout revokes the current session.
- Disable user, role changes, email changes, password changes and password reset flows revoke active user sessions.
- Session validation also checks that the backing user still exists, is active, and still has the required admin role when the actor type is `admin`.

## Audit identity

Write requests under guarded routes are audited with normalized actor identity.

- actor id: session email
- actor role: normalized active role or base role
- actor type: `admin` or `portal`

For legacy-compatible exports, audit serialization maps canonical Czech roles to English labels:

- `pokojska` -> `housekeeping`
- `udrzba` -> `maintenance`
- `recepce` -> `reception`
- `snidane` -> `breakfast`
- `sklad` -> `warehouse`

## Frontend behavior

Both frontends now use the same high-level auth-state contract:

- `authenticated`
- `unauthenticated`
- `error`

Behavior:

- `401` or `403` from `/api/auth/me` becomes `unauthenticated`
- other failures become explicit auth error state
- protected routes redirect to login instead of fabricating access

## Test-only QA behavior

Some CI gate tests still validate utility states such as `loading`, `empty`, `error`, `offline`, `maintenance` and `404`.

That forcing is no longer part of the normal production runtime. It is available only when the QA runtime flag is explicitly enabled for the Playwright test build.
