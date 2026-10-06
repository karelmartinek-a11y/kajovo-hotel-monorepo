# Voice mail conversation reconstruction

Current contract: [voice-mail.md](voice-mail.md). Verified architectural baseline: main 2bf2b144, whose production installed Dagmar module hashes matched source. [Impact matrix](voice-mail-conversation-impact-matrix.md).

Mailbox, actual folder path, current message/draft and ordered complete results now belong to the backend. The model receives only the mail_conversation intent interface. Raw MCP functions are private execution details. Voice connects exclusively to mail-mcp/2 with its 22 production tools and exact schema/annotations handshake. Count and batch operations use the first-class MCP tools; folder completeness and result snapshots are MCP-owned.

Count/read/list/mutation/error/clarification response scripts are constructed by code. Original bodies are loaded completely and supplied to native Realtime as isolated untrusted DATA. Native acoustic/verbatim coverage is a separate acceptance layer, not proved by offline scripted provider tests. No physical microphone/speaker or real SMTP delivery claim follows from backend tests or deployment.

Full validation and deployment evidence belongs in the final run report; do not mark acceptance complete while any required gate or live audio verification remains pending.

When both a message and a draft are selected, an ambiguous pronoun requires one clarification. Explicit draft trash uses only the selected draft reference and resolves its account’s SPECIAL-USE Trash folder. The returned folder is validated before completing the durable operation journal; a mismatch remains uncertain. Draft marking cannot substitute an older selected message.

Production read-only probing observed the reception sync stamp changing between count pages (INDEX_CHANGED). The host retains the true completion failure reason and refuses a partial numeric response. Stable count acceptance requires a stable remote index or a future snapshot/count contract; this run does not modify Mail MCP.
