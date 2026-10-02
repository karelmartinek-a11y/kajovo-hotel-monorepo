# KajaVoiceHA: matice dopadů

Výchozí ověřený produkční i Git commit: `4070c1d287161fafc32e0280ea1c590eaae85903`. Samostatný MCP server, nikoli úprava existujícího hlasového chatu.

| Kategorie | Rozhodnutí | Technické odůvodnění |
|---|---|---|
| Produkční kód | aktualizovat | Nová samostatná aplikace `apps/kajavoiceha`, jediný strukturovaný nástroj. |
| Testy | aktualizovat | Katalog/allowlist, konkrétní capabilities, revize, idempotence, obraz, transport/auth a produkční test 0P0BSvetlo. |
| CI a gates | aktualizovat | Izolovaný Go workflow testuje a sestavuje linux/amd64; nevyvolává deploy hotelu. |
| Dokumentace a schémata | aktualizovat | Veřejný kontrakt, provoz, bezpečné předání tokenu, kamery a integrační příklad. |
| Komentáře a poznámky | aktualizovat | Pouze související nové moduly; aktivní hostitelské části beze změny. |
| AGENTS | aktualizovat | Popsat oddělenou službu a její vlastní certifikát/CI/deploy, zachovat portable Voice Core. |
| Fixtures a příklady | aktualizovat | Syntetická neprodukční data, žádné tokeny/privátní inventáře v Git. |
| Build, generátory, deploy | aktualizovat | Kompilátor XLSX do soukromé mapy, statická binárka, vlastní systemd/UDS/nginx a rollback. |
| Hostitelské API, UI a Android | ověřit beze změny | Nový endpoint nemění jejich kontrakty ani kontejnery. |
| Hotelové databázové migrace | nerelevantní | Stav nové služby je izolovaný; žádná změna hotelového schématu. |

Skutečné soukromé mapy, stavy a klientské tokeny jsou provozní data mimo repozitář. Schválené názvosloví je převzato přesně z uživatelského XLSX.
