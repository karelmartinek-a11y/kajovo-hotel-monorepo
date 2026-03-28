# Jak projekt spustit lokálně

## Požadavky

- Node.js 20+
- pnpm 9+
- Python 3.11+
- JDK 17 pro Android

## 1. Instalace závislostí

Z kořene repozitáře:

```bash
pnpm install
```

Pro API:

```bash
cd apps/kajovo-hotel-api
python -m pip install -e .[dev]
```

## 2. Backend API

```bash
cd apps/kajovo-hotel-api
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Rychlá kontrola:

```bash
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/ready
```

## 3. Portálový web

```bash
cd apps/kajovo-hotel-web
pnpm dev
```

## 4. Admin aplikace

```bash
cd apps/kajovo-hotel-admin
pnpm dev
```

## 5. Android aplikace

Android je samostatný Gradle projekt:

```bash
cd android
./gradlew assembleDebug
```

Na Windows:

```powershell
cd android
.\gradlew.bat assembleDebug
```

## 6. Povinné lokální kontroly

Z kořene repozitáře:

```bash
pnpm typecheck
pnpm unit
pnpm contract:check
pnpm ci:policy
pnpm ci:policy-test
pnpm ci:gates
pnpm ci:e2e-smoke
```

Pokud měníš Android release nebo veřejné APK:

```bash
python scripts/check_android_release_integrity.py
```
