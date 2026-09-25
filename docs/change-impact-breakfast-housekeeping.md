# Dopad změny přehledu snídaní a poznámek pokojské

| Kategorie | Stav | Ověření a výsledek |
| --- | --- | --- |
| 1. Produkční zdrojový kód | Aktualizovat | Portál, administrace, API, sdílené UI a nativní Android používají jeden výběr dne, automatické obnovení a poznámku z Better Hotel. |
| 2. Testy | Aktualizovat | API testy ověřují synchronizaci, poznámku a oprávnění; Playwright pokrývá mobil, tablet a desktop; Android jednotkové testy kontrolují snídaňový modul. |
| 3. GitHub Actions a gates | Aktualizovat | Produkční deploy používá čtecí scénář přehledu místo odstraněného ručního spuštění; CI workflow a required checks zůstávají platné. |
| 4. Dokumentace a schémata | Aktualizovat | Modulové a provozní dokumenty popisují nový přehled; OpenAPI a sdílený klient obsahují nová čtecí pole. |
| 5. Komentáře a poznámky | Ověřit beze změny | V aktivním kódu nezůstává komentář požadující PDF import nebo úpravu poznámky snídaně. Dřívější migrační popisy zůstávají historické. |
| 6. Instrukční soubory | Aktualizovat | Kořenový `AGENTS.md` popisuje aktuální datový kontrakt; lokální instrukce pro dotčené části nejsou. |
| 7. Fixtures, překlady a texty | Aktualizovat | Testovací data pokrývají všechny hosty, národnost a poznámku; neplatné importní překlady a ovládací texty jsou odstraněny. |
| 8. Build, generování a produkční validace | Aktualizovat | API klient je regenerován, Android sestavení je oddělené, deploy ověřuje běžící synchronizaci i nové čtecí atributy. |
