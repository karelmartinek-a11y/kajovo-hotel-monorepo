# Matice dopadů CI

| Kategorie | Rozhodnutí | Technické odůvodnění |
|---|---|---|
| Produkční aplikace | ověřit beze změny | Nemění se routy, autorizace, data ani UI; testuje se stávající runtime. |
| Testy | aktualizovat | Jediný úplný plán; regresní testy selhání runneru. Funkční API, browser a vizuální testy zůstávají. |
| Actions a gates | aktualizovat / odstranit | Dvě povinné kontroly, odstranění duplicitních CI Core, CI Full a CI Release. |
| Current-state, SSOT, README | aktualizovat | Popsat přímý push na main, vrstvy důkazů a nový validační plán. |
| Komentáře a provozní poznámky | aktualizovat | Runner nepřeskakuje povinné kontroly. Historické výsledky zůstávají historickými důkazy. |
| AGENTS.md | aktualizovat | Závazný postup main-only a testovací strategie. |
| Fixtures, snapshoty, překlady | ověřit beze změny | Uživatelský kontrakt se nemění; všechny současné scénáře zůstávají použitelné. |
| Build, generátory, deploy | aktualizovat | Frozen lockfile, jediný release plán a přesné CI SHA; Docker importy/proxy zůstávají povinné. Android je oddělený. |

GitHub nastavení: zakázaná nová PR, blokované vytváření a aktualizace jiných větví, main chráněný proti smazání a force push. Status checks se vyhodnocují po přímém pushi; neúspěšné CI blokuje deploy, nikoliv samotný push.
