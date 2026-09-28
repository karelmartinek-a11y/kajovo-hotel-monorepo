# Samoobslužná změna hesla portálu

## Veřejná žádost

`POST /api/auth/request-password-reset` přijímá e-mail zaměstnaneckého účtu. Pro existující, neexistující, neaktivní i administrátorský účet vrací stejný stav `200` a tělo `{"ok":true}`. Odeslání odkazu je povoleno pouze aktivnímu neadministrátorskému účtu. Opakovaná žádost pro stejný e-mail je nejvýše jednou za hodinu; limit i čas posledního odeslání zůstávají v `AuthLockoutState`. Transportní chyba e-mailu nemění veřejnou odpověď.

Endpoint nemění session ani data účtu. Je proto veřejnou výjimkou CSRF ochrany stejně jako tokenový `POST /api/auth/reset-password`. Odpověď neobsahuje e-mail, existenci účtu ani stav odeslání. Tělo požadavku se normalizuje na malá písmena a nevalidní či příliš dlouhé adresy dostanou shodnou obecnou odpověď.

## Odkaz a dokončení

E-mail obsahuje jednorázový náhodný token v odkazu na `/login/reset`. Do databáze se ukládá pouze SHA-256 tokenu; token platí 24 hodin a má účel `password_reset`. Dokončení ověřuje účel, expiraci, aktivní stav účtu a politiku hesla. Reset hesla revokuje aktivní sessions podle stávajícího auth kontraktu.

Webový login a nativní přihlašovací obrazovka zobrazují akci pro vyžádání odkazu. Výsledek žádosti je na stejné obrazovce a má jednotné znění bez ohledu na existenci účtu. Webový login nabízí češtinu, angličtinu a ukrajinštinu; nativní login přebírá stejný překladový asset a volbu jazyka.

## Dopad a ověření

| Oblast | Stav |
|---|---|
| Produkční kód | aktualizovat: API endpoint, CSRF allowlist, web a nativní Android login |
| Testy | aktualizovat: shodná anonymní odpověď, throttling a Android fake API kontrakt |
| CI a release | aktualizovat: OpenAPI a sdílený klient se generují z aktivního API |
| Dokumentace a instrukce | aktualizovat: tento kontrakt a veřejné CSRF výjimky v `AGENTS.md` |
| Komentáře, fixtures a překlady | ověřit/aktualizovat podle textů v přihlašovacím formuláři |
| Build a deploy | ověřit web lint, API testy, Android unit testy a kontraktovou kontrolu |
