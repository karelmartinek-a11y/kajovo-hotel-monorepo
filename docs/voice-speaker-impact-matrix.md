# Hlasový input a playback

| Kategorie | Současný kontrakt |
|---|---|
| Runtime | Jedna native Realtime/WebRTC capture/playback cesta; native VAD/barge-in; playback neblokuje mikrofon |
| Testy | Lifecycle, reconnect, mute, Stop, uvolnění tracků a provider failure; placené native scénáře pouze explicitně mimo CI |
| CI/gates | Úplný release gate, přenositelnost a Docker/proxy kontroly |
| UI | Hlasový orb, samostatné mute a Stop; bez přepínače reproduktorů nebo tlačítka ručního přerušení |
| API a registry | Potvrzení registry vyžaduje přesný backend readback, dokončenou odpověď a drained playback buffer |
| Akustická evidence | Syntetický barge-in není důkaz fyzické akustiky; povinnou fyzickou iPhone přejímku uživatel zrušil |

Skutečné AEC/noise-suppression/AGC constraints a settings se posuzují odděleně
od naměřené akustické účinnosti. Nezměřené DSP nebo noise-reduction kandidáty
nelze vydávat za ověřenou opravu. Aktuální lifecycle a hranice souhlasu popisuje
[protokol Dagmar](dagmar/IMPLEMENTATION.md).
