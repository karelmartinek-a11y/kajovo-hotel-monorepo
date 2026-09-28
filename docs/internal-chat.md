# Interní webový chat

Portál a webová administrace sdílejí soukromé konverzace 1:1. Účastníci jsou určeni serverovou relací. Adresář zahrnuje aktivní uživatelské účty mimo přihlášeného a administrační identitu; administrační profil se propojí s aktivním admin účtem stejného e-mailu. Deaktivovaný nebo smazaný účet se nenabízí pro nové konverzace, jeho uložená historie zůstává druhému účastníkovi dostupná.

## Rozhraní a kontrakt

- Trasy: `/chat`, `/chat/{conversation_id}`, `/admin/chat`, `/admin/chat/{conversation_id}`.
- API pod `/api/v1/chat`: adresář, konverzace, stránkovaná historie, idempotentní odeslání, potvrzení přečtení, počet nepřečtených a správa Web Push registrace.
- Nepřečtená zpráva se označí přečtenou až po načtení otevřené konverzace. Zprávy zobrazují datum, čas a stav vlastních zpráv.
- Otevřená konverzace se obnovuje každé 3 sekundy; adresář, seznam a počet každých 10 sekund. Při skrytém panelu se periodické načítání pozastaví.
- Spodní lišta je sdílená pro přihlášený portál i administraci: Chat, dostupné rolemi moduly, Profil. Přebytek se posouvá vodorovně. Portálové rychlé volby nálezu a závady zůstávají zachované.

## Nativní Android klient

Zaměstnanecký Android klient používá stejné `/api/v1/chat` endpointy pro adresář, 1:1 konverzace, idempotentní odeslání, potvrzení přečtení a počet nepřečtených. Nativní spodní navigace zpřístupní Chat všem přihlášeným zaměstnaneckým rolím; administrátorské relace zůstávají mimo Android. Seznam a počet nepřečtených se obnovují po 12 sekundách a otevřená konverzace po 3 sekundách. Klient v této verzi nenačítá historii po stránkách; načítá posledních nejvýše 100 zpráv.

Nativní aplikace registruje FCM token až po otevření chatu a po udělení oprávnění k oznámením. Token je přiřazen zaměstnaneckému účtu; při odhlášení se odstraní. API ukládá doručení do samostatného FCM outboxu a opakuje dočasně neúspěšné pokusy. Data zprávy neobsahují text ani jméno odesílatele; Android zobrazí obecnou notifikaci a otevře chat. Projekt `kajovo-hotel-android` má oddělené registrace produkčního i debug package ID.

Pro produkční server nastavte tajný GitHub secret `KAJOVO_API_FIREBASE_SERVICE_ACCOUNT_JSON_B64` jako base64 obsah service-account JSON. CI/deploy jej předá API kontejneru přes `infra/.env`; soubor klíče nepatří do repozitáře. Bez secretu se FCM dispatcher nepokouší odesílat a chat zůstává dostupný pollingem.

## Web Push

Serverové proměnné prostředí (spravují se na serveru nebo v tajném správci deploymentu; hodnoty nepatří do Gitu):

- `KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY`
- `KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY`
- `KAJOVO_API_WEB_PUSH_VAPID_SUBJECT` (například `mailto:admin@hotel.hcasc.cz`)

Vytvořte pár VAPID klíčů jednou pro produkční prostředí, veřejnou část zpřístupněte API a obě části chraňte jako provozní konfiguraci. Veřejný klíč lze získat z autentizovaného `/api/v1/chat/push/config`. Po konfiguraci znovu nasaďte API. Klient registruje endpoint služby Web Push po souhlasu uživatele; registrace se při přihlášení naváže na aktuální účet a při odhlášení odebere. Aplikace musí běžet na HTTPS; iOS vyžaduje webovou aplikaci přidanou na plochu. Když Push není nakonfigurován nebo doručení selže, zpráva je uložena a outbox ji opakuje s prodlevou.

Produkční deploy čte `KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY` a `KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY` z GitHub Actions environment `production` secrets a volitelný `KAJOVO_API_WEB_PUSH_VAPID_SUBJECT` z environment variables; bezpečně je předá do serverového `infra/.env`. Soukromý klíč se nikdy neukládá do repozitáře ani do artefaktů.

Service worker `/service-worker.js` zobrazuje jméno odesílatele a náhled zprávy a při klepnutí otevře cílovou konverzaci. Neověřená relace po přihlášení pokračuje na původním odkazu. Server odmítá nezabezpečené, lokální a nepodporované push endpointy.

## Dopadová matice

| Oblast | Stav | Rozsah |
|---|---|---|
| Produkční kód | aktualizovat | API modely, migrace, relací vázaná autorizace, idempotentní zprávy, Web Push outbox, oba weby a sdílená navigace |
| Testy | aktualizovat | API oprávnění, CSRF, identita admina, idempotence, nepřečtené/přečtené, smazaný účet, responzivní chat |
| CI a release | aktualizovat | API image ověřuje import `pywebpush` a chat routy; kontrakt a webové smoke testy zahrnují změněné obrazovky |
| Dokumentace a schémata | aktualizovat | tento postup, API/OpenAPI, generovaný klient, navigace a UAT |
| Komentáře a instrukce | aktualizovat | kořenový `AGENTS.md` stanoví nový společný navigační a chatový kontrakt |
| Fixtures a texty | aktualizovat | Playwright API uživatel a popisy přístupných akcí, texty chatu v češtině |
| Build a generování | aktualizovat | migrace, export OpenAPI, generování klienta, oba Vite buildy |
| Android | aktualizovat | zaměstnanecký nativní chat registruje FCM token, respektuje oprávnění oznámení a zobrazuje pouze obecnou notifikaci |

Validace změny: `pnpm typecheck`, `pnpm unit`, `pnpm contract:check`, oba webové buildy, API smoke a relevantní Playwright testy. Produkční push vyžaduje konfigurované VAPID proměnné; ověřte zaměstnanec ↔ admin, stav přečtení, doručení oznámení v podporovaném prohlížeči a otevření cílové konverzace.
