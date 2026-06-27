# @kajovo/shared

Sdílený balíček pro typy, RBAC kontrakt a generovaný API klient.

## Co je uvnitř

- `src/rbac.ts`: sdílená autorita pro modulová oprávnění
- `src/generated/client.ts`: generovaný klient z OpenAPI
- `src/i18n/auth.ts`: sdílené auth texty

Generovaný klient se aktualizuje přes `pnpm contract:generate` a validuje přes `pnpm contract:check`.
