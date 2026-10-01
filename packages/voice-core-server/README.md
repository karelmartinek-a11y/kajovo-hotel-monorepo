# Portable Voice Core server

Install with `pip install ./packages/voice-core-server`. Supply host auth, persistence, secret and telemetry adapters. Validate `VoiceCoreConfig` and call `RealtimeSessionClient.create` with an SDP offer and a server-only key.

Catalogs and default policy live here. There are no application entities or routes. The session client accepts optional server-owned remote MCP definitions using McpServerConfig and the McpCapabilityProvider contract and their instructions; default sessions have no tools. Run `python -m pytest packages/voice-core-server/tests`.

McpServerConfig uses SecretStr and hides validation inputs. Only session_tool() explicitly unwraps authorization for the server-to-server Realtime request. Host adapters translate invalid configuration to a safe VoiceError category.

The native MCP definition sent through Realtime calls contains only type, server_label, server_url, authorization, allowed_tools and require_approval. Tool descriptions arrive through MCP import; server_description is not part of the calls wire contract.
The authorization field contains the access token itself, following the native MCP contract. HTTP scheme prefixes do not belong in that field.
