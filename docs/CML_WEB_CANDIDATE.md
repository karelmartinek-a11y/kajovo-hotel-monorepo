# KájovoHotel v CML – vývojový kandidát

Nový frontend vlastní tento repozitář v `apps/kajovo-hotel-api/app/web_ui/`. Jde o nový zdroj podle předlohy, bez přebírání původních UI komponent. Kandidát není produkční release a neodstraňuje původní browserové vstupy před ověřením nové cesty.

Native gateway `/cml-web/` vyžaduje explicitní veřejný JWKS v `CML_WEB_JWKS_PATH` a jednorázový desetisekundový CML podpis pro audience `hotel`. Ověřuje issuer, metodu, plnou cestu s query, tělo a CSRF. Nonce je trvalá přes migraci `0047_cml_web_nonce` a společná všem workerům. Neověřené hlavičky nedávají browseru žádnou identitu.

CML grant se protíná s aktuálním aktivním nativním účtem a přidělenými rolemi Hotelu. Volba role je přípustná jen z aktuálních přiřazených rolí. Hlavní účet zachovává původní technickou admin identitu serveru, aby se nepřerušila vazba historie, chatu a paměti. Provider credentials zůstávají pouze ve vlastním backendu.

Nové UI čte původní housekeeping, snídaňové, skladové, hlásicí a chatové kontrakty. Neověřený zápis se neopakuje automaticky. Samotná přítomnost obrazovky není uzavření jejího funkčního a vizuálního ověření.

Dosud není dokončené pokrytí všech předloh, lokalizací a funkcí, centrální správa účtů/rolí, převod identit, uzavření přímých browserových přihlášení ani hlasový chat v izolovaném kontextu. Opaque sandbox se nesmí zaměnit za ověřený mikrofonní přístup. Publikace na main, produkční nasazení a úplná přejímka zůstávají neprovedené. Nativní Android, strojová API a stávající hlasová implementace nebyly odstřiženy.
