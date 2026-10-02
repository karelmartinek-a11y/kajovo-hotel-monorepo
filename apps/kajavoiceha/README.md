# KajaVoiceHA

Samostatný MCP server s jediným nástrojem `smart_technologie`. Poskytuje vždy celý osmipolový katalog, živé stavy, povolené individuální a skupinové ovládání a obrazový vstup schválené kamery. Soukromá provozní mapa nepatří do Git.

Veřejné připojení: `https://apimcpkajavoiceha.hcasc.cz/mcp`, Streamable HTTP s tokenem samostatného klienta. Hlasová aplikace komunikuje touto cestou také ze stejného hostu.

- [Příručka programátora](docs/README-programator.md)
- [Provoz a nasazení](docs/PROVOZ.md)
- [Kompilace schváleného katalogu](catalog/README.md)
- [Backendový Realtime adaptér](docs/voice-bridge.ts)

Ověření: `go vet ./...`, `go test -race ./...`, Python unittest discovery v `catalog` a `deploy`, Node 24 test `docs/test-voice-bridge.mjs`; linux/amd64 binárka se sestavuje z `./cmd/kajavoiceha`. Izolovaný workflow `KajaVoiceHA` vytváří binární artefakt pro konkrétní SHA. Skutečné nasazení a živé akceptační scénáře uvádí předávací protokol.
