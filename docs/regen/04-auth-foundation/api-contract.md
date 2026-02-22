# 04 Auth foundation – API contract

## Endpoints

- `POST /api/auth/admin/login` – body `{ email, password }`, sets `kajovo_session` + `kajovo_csrf` cookies.
- `POST /api/auth/admin/logout` – clears auth cookies.
- `POST /api/auth/admin/hint` – accepts `{ email }`, returns `{ ok: true }` (SMTP disabled mode).
- `POST /api/auth/login` – portal login `{ email, password }`, sets cookies.
- `POST /api/auth/logout` – clears portal cookies.
- `GET /api/auth/me` – returns `{ email, role, permissions, actor_type }` for current session.

## Session and CSRF

- Session cookie: `kajovo_session`, `HttpOnly`, `SameSite=Lax`, `Secure` only in production.
- CSRF cookie: `kajovo_csrf`, readable by JS for double-submit protection.
- Write methods (`POST/PUT/PATCH/DELETE`) require `x-csrf-token` header matching cookie value,
  except login endpoints.

## Identity source

- RBAC now derives identity from session cookie (`kajovo_session`).
- Header-based identity (`x-user-*`) is no longer used by API authorization.
- Web RBAC bootstrap uses `/api/auth/me` (no URL `access_token`).
