# Forenzní audit brandingu (dagmar-frontend / hotel.hcasc.cz)

Datum: 2026-02-16

## Cíl
- Vynutit používání log **výhradně** z repozitářového adresáře `LOGO/`.
- Odvodit barevnou paletu přímo z log a sjednotit ji napříč UI.
- Odstranit zjednodušené/alternativní branding assety mimo `LOGO/`.

## Zjištění před úpravou
- V projektu existovala vícečetná sada log mimo `LOGO/` (`static/brand/*`, `static/asc_logo.png`, staré favicony).
- UI odkazovalo na zjednodušené varianty `static/LOGO/icon.svg` a `static/LOGO/logo.svg`.
- Barevné tokeny v CSS byly převážně modré a neodpovídaly master logům.

## Provedené kroky
1. **Canon source of truth**
   - Jako jediný zdroj log byl použit `LOGO/assets/*`.
   - Tyto assety byly synchronizovány do `static/LOGO/assets/*` pro runtime servírování.

2. **Přepojení všech odkazů v šablonách**
   - `logo-mark.svg` pro ikonu.
   - `logo-horizontal.svg` pro wordmark.
   - Favikony/app ikony přesměrovány na `LOGO/assets/icons/*`.

3. **Odstranění zakázaných/duplikovaných log**
   - Smazány alternativní zdroje mimo `LOGO/`:
     - `static/brand/`
     - `static/asc_logo.png`
     - legacy favicon/apple-touch/icon soubory ve `static/`.

4. **Paleta odvozená z log**
   - Primární: `#FF0000` (logo red)
   - Tmavá primární: `#B80000`
   - Neutrální šedá: `#808080`
   - Ink/dark: `#141414`
   - Světlé povrchy: `#F7F7F7`, `#FFFFFF`

5. **Aplikace palety napříč stylem**
   - Upraveny tokeny a gradienty v `hotel-brand.css`, `kajovo-ui.css`, `dagmar.css`.
   - Vizuální prvky (topbar, focus, splash, CTA) sjednoceny na novou paletu.

## Výsledek
- Kód a šablony nyní nepoužívají cizí loga mimo `LOGO/assets/*`.
- Barevná paleta je navázaná na master logo assety.
- Zjednodušené/alternativní branding verze byly odstraněny.
