# 07 Apply commits to GitHub – verification

## A) Cíl
Vysvětlit, proč commit `0e7afdd` není vidět na GitHubu, a popsat přesný postup jak lokální commity nahrát do vzdáleného repozitáře.

## B) Exit criteria
- V repu je dokumentovaný postup pro publikaci lokálních commitů.
- Je jasně uvedeno, že bez nastaveného remote/push se commit na GitHubu neobjeví.

## C) Změny
- Přidán tento soubor s postupem publikace commitů.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `git log --oneline -n 5` (obsahuje `0e7afdd` lokálně)
- PASS: `git remote -v` (v tomto prostředí bez výstupu = remote není nastaven)
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit` (lokální Python 3.10 neobsahuje `enum.StrEnum`; CI používá Python 3.11)

## E) Rizika/known limits
- Bez `origin` remote nelze z tohoto prostředí pushnout branch ani vytvořit viditelný GitHub PR URL.

## F) Handoff pro další prompt
Na stroji s přístupem do GitHub repa spusť:
1. `git remote add origin <GITHUB_REPO_URL>` (pokud chybí)
2. `git push -u origin work`
3. Ověř commit: `git ls-remote --heads origin work`
4. Otevři PR z `work` do cílové větve.
