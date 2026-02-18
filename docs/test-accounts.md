# UAT testovací účty a role

Tento dokument definuje doporučené role, oprávnění a příkladné UAT účty pro release candidate testy.

## Cíl

- Pokrýt běžné role hotelového provozu.
- Ověřit, že role vidí jen to, co mají vidět.
- Otestovat klíčové CRUD toky modulů bez použití produkčních osobních dat.

## Navržené role a oprávnění

> Poznámka: IA aktuálně uvádí minimálně oprávnění `read` u aktivních modulů. Pro UAT doporučujeme ověřit také role s právy vytvářet/upravovat záznamy, protože RC checklist obsahuje CRUD scénáře.

### 1) `uat_admin`
- Účel: supervizor UAT / release owner.
- Oprávnění:
  - čtení všech modulů,
  - vytváření a editace ve všech provozních modulech (`/snidane`, `/ztraty-a-nalezy`, `/zavady`, `/sklad`, `/hlaseni`),
  - přístup k utility stavům (`/intro`, `/offline`, `/maintenance`, `/404`) pro ověření.

### 2) `uat_reception`
- Účel: recepce (snídaně, hlášení, orientace v nálezech).
- Oprávnění:
  - `read` + create/edit: Snídaně,
  - `read` + create/edit: Hlášení,
  - `read`: Ztráty a nálezy,
  - `read`: Přehled,
  - bez editace skladu a závad (pokud procesně nedává smysl).

### 3) `uat_housekeeping`
- Účel: housekeeping (závady + ztráty/nálezy).
- Oprávnění:
  - `read` + create/edit: Závady,
  - `read` + create/edit: Ztráty a nálezy,
  - `read`: Přehled,
  - volitelně `read`: Hlášení.

### 4) `uat_warehouse`
- Účel: skladník/provozní.
- Oprávnění:
  - `read` + create/edit: Skladové hospodářství,
  - právo zapisovat skladové pohyby,
  - `read`: Přehled,
  - `read`: Hlášení.

### 5) `uat_auditor_readonly`
- Účel: management/auditor pouze na čtení.
- Oprávnění:
  - pouze `read` pro všechny aktivní moduly,
  - bez create/edit/delete operací.

## Příkladné UAT účty k vytvoření

> Vytvořte pouze neprodukční účty; hesla nastavte dočasná a po UAT deaktivujte.

| Username | Role | Primární použití | Doporučené prostředí |
|---|---|---|---|
| `uat.admin` | `uat_admin` | Kompletní průchod všech UAT scénářů | staging/RC |
| `uat.recepce` | `uat_reception` | Snídaně + Hlášení + čtecí přístup | staging/RC |
| `uat.hk` | `uat_housekeeping` | Závady + Ztráty a nálezy | staging/RC |
| `uat.sklad` | `uat_warehouse` | Sklad + pohyby skladu | staging/RC |
| `uat.audit` | `uat_auditor_readonly` | Read-only regresní ověření | staging/RC |

## Minimální permission testy během UAT

Pro každý účet proveďte alespoň:
1. Přihlášení a otevření přidělených modulů.
2. Pokus o otevření nepovoleného edit/create flow (musí být zablokováno).
3. Ověření, že read-only role nemůže uložit změnu.
4. Ověření, že povolené create/edit flow funguje bez 403.

## Bezpečnostní a provozní pravidla

- Nepoužívat reálná jména hostů ani citlivé údaje.
- Pro test data použít anonymizované/placeholder hodnoty.
- Účty označit prefixem `uat.` pro snadný cleanup.
- Po ukončení UAT:
  - deaktivovat nebo smazat UAT účty,
  - archivovat výsledky testů,
  - zachovat pouze auditní logy dle interní politiky.
