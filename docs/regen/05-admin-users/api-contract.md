# API Contract — 05 Admin Users

## Endpoints

- `GET /api/v1/users` — list portal users.
- `GET /api/v1/users/{user_id}` — portal user detail.
- `POST /api/v1/users` — create portal user (`email`, `password`).
- `PATCH /api/v1/users/{user_id}/active` — enable/disable portal user (`is_active`).
- `POST /api/v1/users/{user_id}/password` — set portal password (`password`).
- `POST /api/v1/users/{user_id}/password/reset` — reset portal password (`password`).

## Rules

- Email is normalized to lowercase and used as the username.
- Email must be unique.
- Password values are never stored in audit logs; audit detail for password endpoints is replaced with metadata (`password_action`, `user_id`).
- All endpoints are protected by RBAC module `users` and require `users:read` or `users:write`.

## Response model

`PortalUserRead`
- `id: number`
- `email: string`
- `role: string`
- `is_active: boolean`
- `created_at: datetime`
- `updated_at: datetime`
