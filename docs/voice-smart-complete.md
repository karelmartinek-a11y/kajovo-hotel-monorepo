# Úplné Smart výběry a ověřené komponenty

Aktuální veřejný kontrakt, modelová projekce, budgety a návrat: [voice-public-contract.md](voice-public-contract.md). Host používá response_mode:complete po ověření podpory v MCP schématu. Starý kompatibilní profil obslouží interním read-only stránkováním; globální rows a osm polí se zachovají. Celá selection zahrnuje všechny shody.

Úplný control readback se stejným request ID a všemi per-command výsledky nahrazuje nadbytečné status/read. Při neúplnosti či nejistotě se dohledá původní operation_status; nový write se automaticky nevydává. Status polling má budget 30 s, SDK _result 35 s; obsolete čekání nesmí blokovat nový turn. Accepted/completed nejsou potvrzení požadované hodnoty a replay není nové měření.

Public contract → deterministická hostová projekce → matching provider ack nahrazuje ruční domain kopie pro nové profily. Identity/consent zůstávají v hostu. [Matice dopadů](IMPACT-MATRIX.md) uvádí kontrolované hranice; skutečné audio/provider/fyzické měření je samostatná přejímka.
