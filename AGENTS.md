## Webovy Release A Produkcni Provoz

- Kazda uzivatelsky viditelna zmena webu nebo adminu musi byt overena pro desktop, tablet a mobil.
- Za jediny zdroj pravdy pro produkcni chovani se povazuje aktualni kod v repozitari a bezici runtime na `https://hotel.hcasc.cz` a `https://hotel.hcasc.cz/admin`.
- Produkcni deploy musi overit shodu mezi nasazenym commitem, runtime artifactem na serveru, bezicimi sluzbami a verejnou domenou `hotel.hcasc.cz`.
- Aktivni deploy ani produkcni validace nesmi byt smerovany na historicky server jen podle stare dokumentace; cilovy server se overuje podle aktualni DNS, deploy konfigurace a beziciho runtime.
- Secrets, hesla, tokeny, klice ani citlive produkcni udaje se nesmi commitovat, vypisovat do reportu ani ponechavat v pracovnim stromu.

## Legacy Android Stav

- Stavajici Android aplikace je vyrazena z provozu a neni soucasti aktualniho release zavazku.
- Stavajici Android zdrojaky, build skripty, signing pravidla, release metadata ani APK artefakty se nesmi udrzovat jako podminka pro webovy runtime nebo deploy.
- Webove opravy `hotel.hcasc.cz` a `hotel.hcasc.cz/admin` nesmi byt blokovany Androidem, Android parity gate ani Android smoke kontrolami.
- Pokud repozitar obsahuje historicke Android materialy, povazuji se za archivni a nesmi se pouzivat jako aktivni instrukce pro vyvoj, CI ani deploy.
- Nova nativni Android aplikace muze vzniknout pozdeji jako samostatny projekt; neni soucasti tohoto repozitare ani aktualniho weboveho deploye.
