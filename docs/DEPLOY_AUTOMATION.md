# Automatické ověření API/admin deploye

GitHub workflow nasazuje pouze úspěšný push CI pro stále aktuální `main` SHA.
API/admin větev `infra/ops/deploy-production.sh` před buildem uloží neměnné
`sha256:` ID právě běžícího API image a použije stejný image pro oba snapshoty.
Změna tagu během buildu proto nemění měřicí prostředí.

`protected_runtime_snapshot.py --docker-image <immutable-id>` načítá veřejná
systemd metadata přes deploy účet. Soubory hashují standardní Python knihovny
v dočasném Docker kontejneru přes již existující Docker oprávnění téhož účtu.
Kontejner má `--network=none`, `--read-only`, `--cap-drop=ALL`,
`no-new-privileges`, omezení procesů/paměti/CPU a pevný seznam read-only bind
mountů bez rekurzivních submountů. Nemá Docker socket, zapisovatelný hostový mount
ani přístup k databázovým volumes. Účet, sudo, skupiny, ACL, Nginx a práva
chráněných souborů se nemění. Privátní obsah neopouští pomocný proces; výstupem
jsou pouze hashe, identity symlinků, seznam připojených kořenů a systemd metadata.

Snapshot zahrnuje Nginx konfiguraci, definice a drop-in soubory chráněných služeb,
aktuální release identity a jejich vyjmenované konfigurace/kód. Absolutní symlinky
zachovávají původní cesty; únik mimo připojené kořeny je chyba. Chybějící historická
cesta je explicitně `absent`. Nepřístupná cesta není absence: neúplná evidence,
neplatný JSON, chyba Dockeru nebo odlišné snapshoty zastaví deploy. Porovnávají
se také ID, image a čas startu chráněného webového a PostgreSQL kontejneru.

Po migraci a výměně pouze API/admin se ověřuje zdraví obou služeb a úplná shoda
snapshotů. Evidence je uložená v `artifacts/deploy-runtime/protected-before.txt`,
`protected-after.txt` a `latest.json` s `protected_runtime=complete_unchanged`
a `snapshot_transport=docker_readonly`. Nejde o náhradu aplikací spravovaných
mimo hotelový release ani o oprávnění měnit jejich data.

HTTP health kontrola zahazuje tělo do `/dev/null`, nemá společný zapisovatelný
soubor v `/tmp` a vyžaduje úspěšný curl transport i očekávaný status. HTTP 200
s přerušeným přenosem není úspěšná kontrola. Chybové tělo se nevypisuje.

Staré release zdrojové stromy se vybírají jen mezi skutečnými adresáři s přesným
40místným Git SHA; nejnovější zůstává. Symlinky a neznámé adresáře se nemažou.
Pokud minulý root deploy vytvořil neveřejný `artifacts/` pod starým releasem,
cleanup jej vyprázdní pomocí stávajícího API image bez sítě a capabilities,
s jediným zapisovatelným mountem přesně tohoto starého metadata adresáře.
Práva ani vlastnictví se nemění. Deploy účet pak odstraní prázdný adresář a
zbytek starého zdrojového stromu. Ostatní chyby oprávnění deploy zastaví.
Databázové a mediální volumes ani běžící image nejsou cílem úklidu.

## Matice dopadů

| Kategorie | Rozhodnutí |
| --- | --- |
| Produkční zdroje | aktualizovat deploy/snapshot, cleanup starých artefaktů a HTTP kontrolu; aplikační chování beze změny |
| Testy | aktualizovat shell/protokolové regrese, přidat skutečný Docker test privátní konfigurace, read-only mountu, neúplné evidence a úklidu root artefaktů |
| CI/gates | doplnit Docker scénář do stávajícího api-runtime-image jobu, zachovat úplný validate plán |
| Dokumentace | aktualizovat deploy runbook a tento kontrakt |
| Komentáře | popsat úplný automatický snapshot bez požadavku na ruční root měření |
| AGENTS | aktualizovat závaznou hranici existujících oprávnění a odmítnutí neúplného snapshotu |
| Fixtures/texty | syntetické neveřejné soubory a symlinky pouze v izolovaném testu; UI beze změny |
| Build/OpenAPI/deploy | ověřit automatický GitHub release; OpenAPI, klient, Android a UI nemají změněný kontrakt |
