# CI gates pro Kájovo Hotel

Tento dokument popisuje minimální CI scaffolding pro vymahatelnost SSOT pravidel v `apps/kajovo-hotel/*`.

## Přehled gate kroků

1. **Token-only lint**
   - Ověřuje JSON konzistenci tokenových SSOT souborů:
     - `apps/kajovo-hotel/ui-tokens/tokens.json`
     - `apps/kajovo-hotel/palette/palette.json`
     - `apps/kajovo-hotel/ui-motion/motion.json`
   - Kontroluje závazné SIGNACE hodnoty (`KÁJOVO`, `#FF0000`, `#FFFFFF`, fixed-left-bottom, visible on scroll).

2. **Signage presence test scaffold**
   - Ověřuje, že IA obsahuje explicitní brand policy a limity:
     - SIGNACE pravidla
     - max 2 brand prvky na view
     - `signageRequired: true` na view úrovni (mimo PopUp pravidla)

3. **View-states completeness scaffold**
   - Ověřuje, že každé view deklaruje minimálně stavy:
     - `loading`, `empty`, `error`, `offline`, `maintenance`, `404`
   - Ověřuje responsivní layout pokrytí:
     - `phone`, `tablet`, `desktop`

## Spouštění lokálně

```bash
pnpm ci:gates
```

Samostatně:

```bash
pnpm ci:tokens
pnpm ci:signage
pnpm ci:view-states
```

## CI workflow

Workflow je v `.github/workflows/ci-gates.yml` a spouští uvedené tři gate kroky na `push` a `pull_request`.
