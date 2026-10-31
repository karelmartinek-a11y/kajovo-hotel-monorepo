# Hlasový chat mimo integraci CML

Uživatel 31. 10. 2026 výslovně zadal hlas vůbec neintegrovat a ponechat
stávající řešení beze změn. Stav je `EXCLUDED_BY_EXPLICIT_USER_REQUEST`.

Kandidát nemá nové hlasové UI, CML background autoritu ani hlasovou migraci.
Podepsaná `/cml-web/` cesta hlasové API odmítá. Původní `dagmar_adapter.py`
je byte-identický s výchozím main `11cde6c60768ebec9eaa31788c524aef73e1c19f`.
Původní nativní cookie identita, Dagmar/VoiceCore runtime, paměť, klíče,
provider granty a původní browserové hlasové komponenty se nemigrují.

Kandidátní admin image nyní zachovává původní build pouze pro původní
hlasovou stránku, přihlášení a jejich assets/brand. Ostatní dokumentové cesty
přesměrovává do CML. Původní login po úspěchu přejde přes `/admin/` na
`/admin/hlasovy-chat`; jeho zdrojový kód se nemění. Hostová mikrofonní policy
připouští pouze původní hlasovou stránku. CML hlasové API nadále odmítá.

Lokální skutečné API/admin/web image a HTTPS host/proxy kvalifikace prošly
`verify_voice_core_proxy.py`: původní hlasový HTML/JS a login 200, branding
200, mikrofonní policy, ostatní dokumentové redirecty, signed/unsigned/replay,
retirement worker a přesný původní Android APK. Cílená sada hranice CML a
původních hlasových regresí má 42 PASS (96 dosavadních warnings).

Historické důkazy odstraněné CML hlasové integrace nejsou aktuální release
kvalifikací. Skutečný hlasový hovor ani placené volání se touto změnou netestují.
Produkce, přihlašovací credentials, hlasové přístupy a jejich aktivace se nemění.
Úplný gate a finální webový cutover celé migrace zůstávají samostatné brány.

## Úplná místní regrese po vyjmutí hlasu

Runtime zdroj `c885251ba46e6da3319ce57d74672b0ea4089e10` prošel 31/31
povinnými kroky release gate. Společná sada API/VoiceCore/Dagmar má 518 PASS,
0 skipped a 270 dosavadních warnings. Původní browserové hlasové regrese
se ověřují pro zachování stávajícího řešení; neimplementují CML hlas.
Artefakt: `release-gate-c885251ba46e-20261031T175955.635912+0000.json`.
Admin zdroj, Dagmar browser, VoiceCore browser a nativní Dagmar adaptér se
shodují s výchozím main `11cde6c60768ebec9eaa31788c524aef73e1c19f`.
Povinná kvalifikace není GitHub CI, produkční deploy ani skutečný hovor.
