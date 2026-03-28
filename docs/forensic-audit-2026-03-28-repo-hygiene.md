# Forenzní audit repo hygieny 2026-03-28

## Cíl

Srovnat repozitář s aktuální realitou projektu, odstranit zjevný odpad, centralizovat current-state dokumentaci a narovnat textovou hygienu.

## Zjištěné problémy

- kořen repozitáře obsahoval jednorázové auditní výstupy a binární `.docx`
- v gitu byly historické release gate artefakty a auditní logy
- pracovní strom obsahoval lokální cache a build výstupy
- dokumentace byla rozptýlená mezi kořen, `docs/`, `android/` a archivní podklady
- část tracked textů měla BOM nebo nekonzistentní konce řádků

## Provedené kroky

- kořenové auditní podklady byly přesunuty do `docs/archive/root-audits/`
- historické Android handoff a step dokumenty byly přesunuty do `docs/archive/android-history/2026-03-16/`
- historické forenzní dokumenty z `docs/` byly přesunuty do `docs/archive/docs-history/`
- hlavní README a current-state provozní dokumentace byly přepsány podle skutečné struktury webu, adminu, API a Androidu
- byl přidán `docs/repository-map.md` jako centrální inventura repa
- byly doplněny `.editorconfig` a přísnější `.gitattributes`
- textové soubory byly normalizovány na UTF-8 bez BOM a LF, s výjimkou Windows skriptů, které zůstávají v CRLF
- lokální cache a build adresáře byly odstraněny

## Current-state autority po úklidu

- `README.md`
- `docs/README.md`
- `docs/repository-map.md`
- `docs/how-to-run.md`
- `docs/testing.md`
- `docs/how-to-deploy.md`
- `docs/release-checklist.md`
- `docs/ci-gates.md`
- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/rbac.md`
- `android/README_ANDROID.md`
- `android/release/android-release.json`

## Výsledek textové hygieny

- běžné tracked textové soubory jsou bez BOM
- běžné tracked textové soubory mají LF
- záměrné výjimky s CRLF zůstávají jen u Windows skriptů a `android/gradlew.bat`
- forenzní encoding audit dál hlásí falešně pozitivní nálezy ve skriptech `scripts/bulk_encoding_remediator.py` a `scripts/yolo_text_repair.py`, protože tyto skripty záměrně obsahují seznam podezřelých mojibake sekvencí

## Otevřená rizika

- pracovní strom už před začátkem auditu obsahoval rozdělané změny v RBAC a routách; audit do jejich logiky nezasahoval
- obsah `legacy/` zůstává historickou evidencí a může obsahovat zastaralé informace
