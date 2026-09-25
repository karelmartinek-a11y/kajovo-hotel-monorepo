# Modul Snídaně

Portál `/snidane` a administrace `/admin/snidane` zobrazují denní přehled z Better Hotel API. Jeden datumový řádek má šipky, výběr data a tlačítko **Dnes**. Otevřený přehled se obnovuje každých 60 sekund a při návratu do okna. Server synchronizuje aktuální den a následující dny podle `breakfast_scheduler_interval_seconds` (výchozí hodnota 300 sekund). Rozsah dopředu určuje `better_hotel_breakfast_window_days_forward`.

Každý řádek zobrazuje pokoj, všechna jména hostů evidovaná v `guest_list`, zemi hlavního hosta, počet snídaní, diety a poznámku `reservation_note[].housekeep`. Jména všech hostů a země jsou samostatná čtecí pole `guest_names` a `country_code`; `guest_name` zachovává jména strávníků pro existující kontrakt. Poznámka je pro všechny role pouze ke čtení. API přijímá `note` v odpovědi, ale odmítá ji v `POST` a `PUT` požadavku.

Synchronizace mapuje kódy stravování na snídani od dne po příjezdu do dne odjezdu včetně. Řádky páruje stabilním `source_key` podle data a Better Hotel ID rezervací. Existující řádek aktualizuje na místě, aby zůstalo jeho ID a stav výdeje. Zmizelou snídani odstraní. Poznámku vždy přebírá z Better Hotelu; dřívější místní poznámku nepřenáší. Migrace `0034_breakfast_guest_display` doplňuje jména všech hostů a zemi hlavního hosta.

Role `snídaně` může v povoleném čase označit snídani jako vydanou. `recepce` a `admin` mohou vrátit výdej, spravovat snídani a měnit diety ověřené rezervace přes `PATCH /api/v1/breakfast/{order_id}/reservations/{reservation_id}/diet` s verzí. Diety patří ID rezervace v `reservation_breakfast_diets`; číslo pokoje není identita pobytu. Denní `PUT` diety nemění. Exportní PDF endpoint `/api/v1/breakfast/export/daily` zůstává pro oprávněné role. PDF import a ruční spuštění synchronizace nemají aktivní routu.

Denní přehled čte `GET /api/v1/breakfast/daily-overview?service_date=YYYY-MM-DD`. Souhrn a seznam jsou v jedné odpovědi. Produkční deploy ověřuje tento kontrakt a pokojské poznámky skriptem `scripts/verify_live_breakfast_overview.mjs`.
