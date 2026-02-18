# UAT scénáře pro Kájovo Hotel (RC)

Tento dokument navazuje na cutover/release runbook a slouží jako praktický UAT checklist pro hotelový personál.

## Rozsah a předpoklady

- Testované moduly: Přehled, Snídaně, Ztráty a nálezy, Závady, Skladové hospodářství, Hlášení.
- Utility stavy: `/intro`, `/offline`, `/maintenance`, `/404`.
- Každý scénář se provádí minimálně na:
  - **telefonu** (drawer „Menu“, vyhledávání v menu),
  - **tabletu** (max. 4 položky top-level, ověřit overflow),
  - **desktopu** (max. 6 položek top-level, ověřit overflow „Další“).
- V každém scénáři ověřte i chování při prázdných datech, chybě API (5xx) a offline režimu.

## Device & navigace checklist (provedení u každého modulu)

1. **Telefon**
   - Otevřít drawer přes „Menu“.
   - Ověřit funkčnost hledání v menu (`Hledat v menu`).
   - Ověřit, že se všechny aktivní moduly dají otevřít bez ztráty kontextu.
2. **Tablet**
   - Ověřit, že viditelné top-level položky nepřesáhnou 4.
   - Přebytek je dostupný přes položku **„Další“** (overflow).
3. **Desktop**
   - Ověřit, že viditelné top-level položky nepřesáhnou 6.
   - Přebytek je dostupný přes **„Další“**.
4. **Overflow navigace**
   - Přes „Další“ otevřít alespoň 2 moduly ze sekce Evidence.
   - Návrat zpět na Přehled musí fungovat bez reload loop/runtimových chyb.

## UAT scénáře (hotel staff)

### 1) Přehled (Dashboard)

**Scénář 1: Otevření přehledu po přihlášení směny**
- Kroky:
  1. Otevřít `/`.
  2. Zkontrolovat, že je stránka načtena bez chyb JS a bez blokujících spinnerů.
- Očekávaný výsledek:
  - Standardní stav: přehled je dostupný a navigace reaguje.
  - Empty: zobrazí se validní „žádná data“ stav (bez pádu).
  - Error: uživatel vidí chybový stav + možnost opakovat akci/vrátit se.
  - Offline: při odpojení sítě je uživatel přesměrován/veden na offline stav.

### 2) Utility stavy

**Scénář 2: Intro stránka pro interní ověření**
- Kroky: otevřít `/intro`.
- Očekávaný výsledek:
  - Stránka je dostupná na phone/tablet/desktop.
  - Žádná runtime chyba v konzoli.

**Scénář 3: Offline stránka**
- Kroky:
  1. Otevřít `/offline`.
  2. Simulovat odpojení sítě v zařízení.
- Očekávaný výsledek:
  - Uživatel dostane srozumitelnou informaci o offline stavu.
  - Návrat po obnově konektivity funguje bez ztráty session.

**Scénář 4: Maintenance stránka**
- Kroky: otevřít `/maintenance`.
- Očekávaný výsledek:
  - Zobrazen servisní stav, aplikace nespadne.
  - Navigace na dostupné routy funguje podle nastavení.

**Scénář 5: 404 stránka**
- Kroky: otevřít neexistující URL (např. `/neexistuje`).
- Očekávaný výsledek:
  - Aplikace zobrazí 404 stav.
  - Uživatel se může vrátit na `/`.

### 3) Snídaně (`/snidane`)

**Scénář 6: Recepce založí nový záznam snídaně**
- Kroky:
  1. Otevřít `/snidane`.
  2. Přes `/snidane/nova` založit záznam.
  3. Ověřit detail `/snidane/:id`.
- Očekávaný výsledek:
  - Nový záznam se uloží a je viditelný v seznamu.
  - Detail odpovídá uloženým datům.

**Scénář 7: Editace existující snídaně**
- Kroky: otevřít `/snidane/:id/edit`, změnit hodnotu, uložit.
- Očekávaný výsledek:
  - Změna je perzistentní po refresh.
  - Error při 5xx zobrazí validní chybový stav bez ztráty formuláře.

### 4) Ztráty a nálezy (`/ztraty-a-nalezy`)

**Scénář 8: Housekeeping zapisuje nalezený předmět**
- Kroky:
  1. Otevřít `/ztraty-a-nalezy`.
  2. Přes `/ztraty-a-nalezy/novy` vytvořit položku.
  3. Otevřít detail `/ztraty-a-nalezy/:id`.
- Očekávaný výsledek:
  - Záznam se objeví v seznamu a detail je dostupný.
  - Empty stav seznamu je čitelný (pokud není žádný záznam).

**Scénář 9: Editace položky ztrát a nálezů**
- Kroky: `/ztraty-a-nalezy/:id/edit` -> upravit stav -> uložit.
- Očekávaný výsledek:
  - Editace proběhne bez chyb.
  - Offline pokus o uložení vrátí informaci, že akce neproběhla.

### 5) Závady (`/zavady`)

**Scénář 10: Nahlášení závady na pokoji**
- Kroky:
  1. Otevřít `/zavady`.
  2. Přes `/zavady/nova` vytvořit závadu.
  3. Ověřit detail `/zavady/:id`.
- Očekávaný výsledek:
  - Závada je založena a dohledatelná v seznamu.
  - Error stav API je ošetřen bez pádu stránky.

**Scénář 11: Změna stavu závady po opravě**
- Kroky: `/zavady/:id/edit` -> změnit stav na uzavřeno -> uložit.
- Očekávaný výsledek:
  - Stav je aktualizovaný i po refresh.
  - V offline režimu se změna neprovede a uživatel dostane upozornění.

### 6) Skladové hospodářství (`/sklad`)

**Scénář 12: Vytvoření nové skladové položky**
- Kroky:
  1. Otevřít `/sklad`.
  2. Přes `/sklad/nova` vytvořit položku.
  3. Ověřit detail `/sklad/:id`.
- Očekávaný výsledek:
  - Položka se uloží a je vidět v seznamu.
  - Empty stav je správně zobrazen při nulových položkách.

**Scénář 13: Pohyb na skladu (naskladnění/výdej)**
- Kroky:
  1. Na detailu položky provést pohyb skladu.
  2. Ověřit, že se změnilo množství.
- Očekávaný výsledek:
  - Hodnota množství odpovídá provedenému pohybu.
  - Chybová odpověď API nevede ke „tichému“ uložení neplatných dat.

### 7) Hlášení (`/hlaseni`)

**Scénář 14: Vytvoření provozního hlášení směny**
- Kroky:
  1. Otevřít `/hlaseni`.
  2. Přes `/hlaseni/nove` založit nové hlášení.
  3. Ověřit detail `/hlaseni/:id`.
- Očekávaný výsledek:
  - Hlášení je uložené, dostupné v seznamu i detailu.
  - Offline uložení je korektně odmítnuto s informací uživateli.

**Scénář 15: Editace existujícího hlášení**
- Kroky: `/hlaseni/:id/edit` -> upravit obsah -> uložit.
- Očekávaný výsledek:
  - Editace je perzistentní po obnově stránky.
  - Při 5xx je viditelný error stav a data formuláře nezmizí.

### 8) Cross-module provozní scénáře

**Scénář 16: Rychlé přepínání modulů během směny**
- Kroky:
  1. Otevřít postupně `/snidane` -> `/zavady` -> `/sklad` -> `/hlaseni`.
  2. Přecházet i přes overflow „Další“.
- Očekávaný výsledek:
  - Navigace je stabilní, bez „zamrzání“ a bez nečekaného odhlášení.

**Scénář 17: API degradace během provozu**
- Kroky:
  1. Simulovat neodpovídající API endpoint modulu.
  2. Ověřit zobrazení error stavu.
- Očekávaný výsledek:
  - Aplikace nezkolabuje globálně; selže jen dotčená operace/modul.
  - Uživatel může pokračovat v jiných modulech.

**Scénář 18: Návrat z offline do online**
- Kroky:
  1. Otevřít modul (např. `/sklad`).
  2. Vypnout síť (offline), poté obnovit.
  3. Znovu načíst modul.
- Očekávaný výsledek:
  - Offline stav je korektní.
  - Po obnovení konektivity lze data znovu načíst bez restartu aplikace.

---

## Evidence výsledků UAT

Pro každý scénář zapisujte:
- datum/čas,
- tester + zařízení (phone/tablet/desktop),
- výsledek (PASS/FAIL),
- poznámku (URL, screenshot, případně API endpoint),
- blokující/neblokující klasifikaci vady.

Doporučení: FAIL v CRUD toku modulů Snídaně, Závady, Sklad, Hlášení považujte za **NO-GO** pro cutover.
