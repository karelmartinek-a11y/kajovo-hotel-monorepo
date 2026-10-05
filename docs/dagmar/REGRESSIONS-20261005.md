# Zachované regrese hovoru z 2026-10-05

Aktivní testy dál chrání vícevěté audio diktování, retry prokazatelně neodeslaného
schema rejection pod stejnou task identitou, revokaci souhlasu při reconnectu,
obnovení function/output párů a ochranu originálního mutation journalu.
Forget invaliduje aktivní i odpojené logical tasks a privacy pause přežije reconnect.

Regrese mail read/draft workeru ověřuje jediné MCP volání a jediné doručení výsledku,
i když obsah obsahuje neplatnou URL. Další memory read nadále funguje. Diagnostický
collector už v této cestě neexistuje; scénáře jeho kapacity/flush timeoutu byly odstraněné.
Úspěšné odpovědi a mail ready/read výsledky nejsou rutinně logované.

Doklady v `evidence/regressions-20261005/` jsou historická evidence tehdejších SHA,
nikoli současný runtime kontrakt. Aktivní kontrakt je v [IMPLEMENTATION.md](IMPLEMENTATION.md)
a [STABILIZATION.md](STABILIZATION.md); nové odstranění má vlastní
[matici a měření](../voice-diagnostics-removal.md). Akustická R3 přejímka zůstává neověřená.
