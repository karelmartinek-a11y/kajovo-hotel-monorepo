# AGENTS.md — kajovo-hotel-monorepo

## Jazyk a styl komunikace
- Komunikuj VÝHRADNĚ v českém jazyce.
- Piš stručně, technicky a věcně.
- Nepoužívej domněnky. Když si nejsi jistý, nejdřív dohledávej v repozitáři.
- V odpovědích vždy uváděj přesné cesty k nalezeným souborům, které jsou pro změnu důležité.

## Závazné pravidlo pro design a branding
- V repozitáři existuje Manifest designu. Je ZÁVAZNÝ A NEVYJEDNATELNÝ.
- Než začneš navrhovat nebo měnit UI, vždy nejdřív najdi přesnou cestu k Manifestu designu a výslovně ji vypiš.
- Pokud existují mobilní PNG / screen návrhy, jsou závazné pro odpovídající obrazovky.
- Brand / logo / assety v adresáři `brand` jsou závazné.
- Pro Android jsou závazné zejména:
  - `docs/KajovoHotelAndroidAplikaceZadani_2026.md`
  - `docs/ManifestDesignKájovo.md`
  - `brand/apps/kajovo-hotel`
  - `brand/panel`
- Pro web jsou závazné:
  - Manifest designu nalezený v repozitáři
  - relevantní webové assety a logo v `brand`
- Pokud je více variant loga/brand assetů, najdi přesné soubory a odůvodni volbu primární varianty podle Manifestu designu.

## Základní workflow před každou změnou
Než začneš měnit jakýkoli soubor, je POVINNÉ provést tento postup a výsledek stručně shrnout:
1) Vypiš:
   - `git status -sb`
   - `git branch --show-current`
   - `git remote -v`
2) Zkontroluj, zda je aktuální stav bezpečně obnovitelný z GitHubu.
3) Pokud je pracovní strom nečistý nebo jsou lokální commity, které nejsou na GitHubu:
   - vytvoř timestampovanou záložní branch `backup/pre-codex-YYYYMMDD-HHMM`
   - ulož do ní aktuální stav tak, aby byl obnovitelný
   - pushni ji na origin
   - vypiš přesný název záložní branch
4) Pokud je branch čistá, ale není pushnutá, pushni ji na origin.
5) Teprve potom začni dělat změny na pracovní feature branch.

## Povinné pravidlo pro GitHub bezpečnost a obnovitelnost
- Nikdy nezačínej pracovat na stavu, který není obnovitelný z GitHubu.
- Nikdy nemaž záložní `backup/pre-codex-*` branch bez explicitního pokynu člověka.
- Na `main` / produkční větev necommituj napřímo, pokud to není explicitně nařízené a zároveň to odpovídá pravidlům repozitáře.
- Před mergem vždy nejdřív ověř pipeline, required checks a branch protection, pokud jsou k dispozici.

## Runtime oprávnění a internet
- Tato instrukce sama o sobě nenastavuje sandbox, internet ani approval policy; to řídí spuštění Codexu a jeho config.
- Pokud relace nemá oprávnění potřebná pro požadovanou práci (zápis do repo, přístup na internet, práce s GitHubem), NEZAČÍNEJ improvizovat.
- Místo toho hned na začátku uveď, že aktuální runtime oprávnění nestačí, a požádej operátora o znovuspuštění Codexu se správným profilem / konfigurací.
- Pokud je relace spuštěna s plným přístupem, stále pracuj konzervativně a neprováděj destruktivní operace bez jasného důvodu.
- Pokud je nutné použít internet, preferuj dohledání informací přes podporované nástroje Codexu a záznam výsledku do shrnutí.

## Povinný průzkum před implementací
Před implementací vždy:
1) Najdi a vypiš přesné cesty k relevantním souborům.
2) Najdi:
   - frontend entrypointy
   - backend API / routery / controllery
   - auth a RBAC
   - ORM / DB modely / migrace
   - upload/storage
   - PDF import/export
   - `.github/workflows`
   - test/lint/build příkazy
3) Pokud jde o Android:
   - najdi zadání, Manifest designu, brand assety a screen podklady
   - najdi backend endpointy a auth flow, které bude mobil používat
4) Pokud jde o web:
   - najdi login obrazovku hotel.hcasc.cz
   - najdi admin shell, modulové routy a layouty

## Postup práce pro větší úkoly
Pro každý větší úkol dodrž:
1) Triage:
   - co existuje
   - kde to je
   - jaké to má závislosti
2) Plan:
   - krátký konkrétní plán
   - dotčené moduly
   - DB změny
   - API změny
   - UI změny
3) Implementace:
   - dělej malé, logické kroky
   - drž se existujících konvencí repa
4) Validace:
   - přidej/aktualizuj testy
   - spusť lint/test/build
   - oprav selhání
5) Shrnutí:
   - vypiš změněné soubory
   - vypiš migrace
   - vypiš spuštěné příkazy
   - vypiš otevřená rizika

## RBAC a business pravidla
- Uživatel může mít 1+ rolí.
- UI i backend autorizace musí být konzistentní.
- Admin má plný přístup ke všem modulům a pohledům.
- Mazání citlivých záznamů je admin-only, pokud zadání neříká jinak.
- Vždy ověřuj, že role-based viditelnost dat odpovídá zadání.

## Web portal — specifické instrukce
- Pracuje se na webovém portálu hotel.hcasc.cz.
- Každá změna UI musí respektovat závazný Manifest designu a webové brand assety.
- Pokud je potřeba upravit login obrazovku nebo flow přechodu web -> Android aplikace, navrhni řešení, které je technicky udržitelné a v souladu s aktuální architekturou repa.
- Před finálním mergem vždy porovnej lokální validaci s GitHub workflows a required checks.

## Android — specifické instrukce
- Android projekt musí vzniknout v `KajovoHotelAndroid` v rootu repozitáře.
- Název aplikace je `KájovoHotel`.
- Launcher icon i in-app branding musí používat správnou Mark/sign variantu z `brand/apps/kajovo-hotel`.
- Obrazovky implementuj podle `docs/KajovoHotelAndroidAplikaceZadani_2026.md` a podle `brand/panel`, kde čísla názvů odpovídají číslům obrazovek v zadání.
- Už od prvních commitů musí být architektura připravená pro:
  - role-based navigation
  - deep links / app links / open-in-app flow
  - kontrolu novější verze aplikace
  - brandově správný launcher a in-app logo usage

## CI/CD, PR a merge
- Před otevřením PR vždy spusť stejné nebo ekvivalentní kontroly, které vyžaduje pipeline.
- Pokud je dostupný `gh` a je přihlášený, používej ho pro práci s PR.
- Před finálním mergem v interaktivní relaci vždy explicitně požádej člověka o potvrzení.
- Po úspěšném mergi smaž pracovní feature branch pouze tehdy, když:
  - merge proběhl úspěšně
  - required checks jsou zelené
  - repo konvence nebo branch protection to dovolují
- Záložní `backup/pre-codex-*` branch nemaž.

## Windows / lokální prostředí
- Primární lokální cesta uživatele je `C:\github\kajovo-hotel-monorepo`.
- Pokud je možné použít Windows-kompatibilní příkazy nebo projektové skripty, preferuj je.
- Pokud nějaký příkaz funguje lépe ve WSL nebo v jiném shellu, uveď to explicitně.

## Co dělat při nejasnosti
- Nejdřív dohledávej v repozitáři.
- Pokud odpověď v repozitáři není, nabídni 2–3 konkrétní varianty řešení s dopady.
- Jednu variantu označ jako doporučenou a vysvětli proč.
