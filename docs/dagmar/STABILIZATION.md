# Funkční stabilita hlasového hovoru

Platí owner/session izolace LogicalCall, epoch fencing pozdních browser odpovědí,
kontextový RAM limit 4000 kompatibilních tokenů/24000 bytes a originální journal ID.
Každý manual response.create rezervuje unikátní intent a po získání transport locku
znovu ověřuje generaci a životnost. Native VAD vlastní přerušení; žádné plošné
cancel/clear ani replay již odeslaných mutací není povolené.

Explicitní memory intent patří konkrétnímu skutečnému audio itemu a cíli; omezení
pět minut, osm souvisejících turnů a 8000 znaků zůstávají. Tool data a obnovený
kontext jsou data, nikoli lidský souhlas. Forget pokrývá odpojené úlohy a privacy
pause přežívá provider reconnect. Vracení kontextu zachovává function/output páry.

Registry readback vyžaduje začaté, dokončené shodné provider audio a drain
správného response ID, potom další skutečné lidské audio. Reconnect ruší souhlas,
nikoli trvalé výsledky a originální request ID. Neznámý výsledek používá původní
operation_status; nový apply není automatická oprava.

Start/Stop, late allocation, bounded reconnect, recoverable provider rejection,
interruption a cleanup pokrývají browser a skutečné serverové testy s externími
fixtures. Responsive browser test kontroluje síť bez diagnostických požadavků,
žádný MediaRecorder ani getStats timer, společnou call identitu po reconnectu,
jediný pozdrav a nulový heartbeat audit. Offline test chrání historické v1/v2.

Žádný neověřený DSP/filter se nezapíná. Noise reduction candidates zůstávají opt-in
se stejným výchozím nastavením; realtime model ani závislosti nejsou plošně měněné.
Fyzická iPhone přejímka byla uživatelem zrušena 2026-10-04. Syntetické testy a
měření režie neprokazují akustickou kvalitu ani vyřešení všech hlasových potíží.
