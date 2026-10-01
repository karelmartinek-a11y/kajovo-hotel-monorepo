# SSOT scope and status

## Autorita

- Produkční zdrojový kód, aktivní workflow a ověřený runtime jsou nejvyšší zdroj pravdy.
- Current-state dokumentace v `docs/` popisuje jen aktivní web, admin, API, CI a deploy řetězec.
- Pokud se dokumentace rozchází s kódem nebo runtime, opravuje se dokumentace, ne funkční produkční kód.

## Závazné current-state soubory

- `docs/SSOT_CURRENT.md`
- `docs/current-state-manifest.yaml`
- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/rbac.md`
- `docs/how-to-run.md`
- `docs/testing.md`
- `docs/voice-core.md`
- `docs/how-to-deploy.md`
- `docs/ci-gates.md`
- `docs/release-checklist.md`

## Mimo rozsah

- Historické audity, cutover plány, migrační poznámky a jednorázové reporty nejsou current-state autorita.
- Android release chain, APK workflow a parity pravidla nejsou součástí aktivního webového provozu.

Voice Core ukládá ciphertext pod samostatným `KAJOVO_API_VOICE_MASTER_KEY`. Volitelný stejnojmenný GitHub secret se přenáší pouze do API runtime; chybějící hodnota nepřepisuje existující serverový master klíč. Jeho změna vyžaduje opětovné zadání OpenAI klíče nebo naplánovanou migraci ciphertextu. Pouhé vytvoření pracovní větve funkci nenasazuje; hlasový smoke v CI není placený. Viz [Voice Core](voice-core.md).

## Automatický hotelový release

`deploy-production.yml` navazuje na úspěšné CI Gates aktuálního main. Ruční workflow dispatch vyžaduje stejné přesné SHA a kontroly. `check_release_review.py` ověřuje aktuální main, poslední dokončené úspěšné CI Gates pro toto SHA a obsahově vázané skutečně provedené nezávislé review. Výstupem je přesné CI run ID a profil review. Připravovací job nemá produkční credentials. Důvěryhodný main kód provede gate před checkoutem kandidáta a před vložením produkčních secrets.

CI sestaví API, admin a web pro linux/amd64. Ověří import API, prázdný registr schopností a skutečný proxy řetězec proti týmž image IDs, které exportuje do `release-images-<SHA>`. Manifest váže zdrojové SHA, všechny tři image IDs, úspěšné kontroly a SHA256 image archivu. Deploy stáhne artefakt z přesného ověřeného CI běhu a ověří jej před vložením credentials i před publikací na serveru. Chybějící nebo expirovaný artefakt vyžaduje nové úspěšné CI téhož aktuálního SHA. Compose používá přesné IDs, pull_policy: never a up --no-build.

## Root controller a obnova

Jednorázový root prerequisite je `bash infra/ops/install-hotel-release-controller.sh` z ověřeného zdroje. Instaluje vlastní hotelový controller, nezávislý systemd deadline timer a úzce omezená sudo oprávnění pro deploy-hotel; Nginx oprávnění nerozšiřuje. Controller používá Python 3.11 nebo novější. SSH deploy ověří helpery, aktivní timer a hash/root vlastnictví instalovaných controller/validator modulů proti ověřenému kandidátu.

Kontrola staré deploy autority přijímá prázdný výsledek přesného `systemctl list-unit-files` dotazu i s návratovým kódem 1, který znamená žádnou shodu. Chybový výstup, jiné selhání dotazu nebo aktivní/povolená stará mutační jednotka přípravu odmítne.

Veřejná metadata jsou v `/etc/kajovo-hotel-release-public/transaction.json`; root-only snapshoty v `/var/lib/kajovo-hotel-release`. Root helper přijímá pouze akci a přesné SHA:

```sh
sudo -n /usr/local/bin/kajovo-hotel-release prepare <40hex_SHA>
sudo -n /usr/local/bin/kajovo-hotel-release activate <40hex_SHA>
sudo -n /usr/local/bin/kajovo-hotel-release status <40hex_SHA>
sudo -n /usr/local/bin/kajovo-hotel-release accept <40hex_SHA>
sudo -n /usr/local/bin/kajovo-hotel-release rollback <40hex_SHA>
```

Prepare zaznamená skutečně běžící Docker runtime, aktivní source/env podle container labels, image IDs a jejich privátní export, Nginx a Alembic revision. Kandidát musí zachovat živou databázovou revision a master klíč. Privátní env doslovně zachovává znaky hesel včetně dolarů, uvozovek a zpětných lomítek; načítá se přes Compose a nikdy jako shell kód. Zdroj a konfigurace již publikovaného SHA se při opakování nepřepisují. GitHub nepřenáší odstraněné integrační secrets; jejich staré hodnoty se z nového env odstraní. Ostatní služby a obchodní integrace hotelu zůstávají samostatné.

Activate spustí root spravovaný systemd worker pod deploy-hotel. Každá runtime změna probíhá pod root-owned fence a ověřuje SHA, transaction_id, phase a deadline. Samostatný timer běží každých 15 sekund; výchozí acceptance deadline je 1800 sekund od přípravy. Výpadek SSH/runneru tak nezruší ochranu. Worker failure nebo neprovedené acceptance do deadline zahájí obnovu.

Rollback nejprve zneplatní transakci, zastaví celý systemd cgroup i hotelové one-off migrační kontejnery a pod runtime fence obnoví zachycené images/topologii/Nginx. Nasazení vyžaduje existující ověřenou databázi; její role, hesla ani databázi znovu nevytváří. Provádí jen forward Alembic migrace a kompatibilní schema reconciliation. Obnova databázi nedowngraduje ani nemaže volumes. Snapshoty a aktuální i rollback obrazy se po acceptance ponechávají; deploy nemá automatický prune.

## Acceptance

Workflow ověří TLS s platností delší než 30 dní, přesné SHA runtime artefaktu a image IDs, skutečné přihlášení, snídaně, pokoje, správu uživatelů a samostatnou Voice stránku na desktopu, tabletu a mobilu. Voice kontrola ověřuje autentizaci, CSRF, odmítnutí neplatného SDP, neaktivní tool endpoint a absenci integračního UI bez placeného provider volání. Placený speech smoke je samostatný explicitní opt-in podle Voice Core runbooku.

Až po všech kontrolách controller přijme přesný runtime. Accept a deadline rozhodují pod stejným lockem; úspěšné acceptance se pozdějším timerem nerevokuje. Selhání workflow vyvolá rollback a přerušení runneru pokrývá nezávislý timer. Úspěch CI nebo workeru před acceptance sám nepotvrzuje přijetí produkce. Aktivní deploy se novým pushem neruší.
