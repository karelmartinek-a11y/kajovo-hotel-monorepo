# Kájovo Hotel Web

Portálová webová aplikace pro provozní role nad společným FastAPI backendem.

## Scope

- přihlášení a reset hesla
- výběr role
- profil a změna hesla
- utility stavy
- moduly `snídaně`, `ztráty a nálezy`, `závady`, `sklad`, `hlášení`
- omezená admin větev jen jako přesměrování a retired surface

## Příkazy

```bash
pnpm dev
pnpm build
pnpm test:smoke
pnpm test:visual
```

Design a IA vstupy bere aplikace z `apps/kajovo-hotel/` a sdíleného UI v `packages/ui`.
