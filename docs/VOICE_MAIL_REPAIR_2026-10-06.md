# Voice mail conversation reconstruction

Current contract: [voice-mail.md](voice-mail.md). Verified architectural baseline: main 2bf2b144, whose production installed Dagmar module hashes matched source. [Impact matrix](voice-mail-conversation-impact-matrix.md).

Mailbox, actual folder path, current message/draft and ordered complete results now belong to the backend. The model receives only the mail_conversation intent interface. Raw MCP functions are private execution details. Host count mode remains an unchanged internal complete-count operation. The external mail-mcp/1 interface still has 20 tools; backend catalogs include the independently introduced scope/folder error codes.

Count/read/list/mutation/error/clarification response scripts are constructed by code. Original bodies are loaded completely and supplied to native Realtime as isolated untrusted DATA. Native acoustic/verbatim coverage is a separate acceptance layer, not proved by offline scripted provider tests. No physical microphone/speaker or real SMTP delivery claim follows from backend tests or deployment.

Full validation and deployment evidence belongs in the final run report; do not mark acceptance complete while any required gate or live audio verification remains pending.
