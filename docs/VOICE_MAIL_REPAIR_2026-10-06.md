# Voice mail repair: first implementation slice (not full acceptance)

Base: `9c03918bc56d48d0fcbf7c4386e203bd30e6e098`.

## Implemented

- `mail_messages_search` has a **host-only** `result_mode: "count"` option. The voice backend traverses every result page, retaining account/folder/search filters. It returns a number only for a complete result with unchanged per-account synchronization watermarks. Partial, unavailable, overlapping or changing results do not become zero or a first-page count. Time/page limits return `count: null`, never a purported exact total.
- Model-facing searches require an explicit `account`. The remote mail-mcp/1 installation catalog and its transport validation remain unchanged; `result_mode` is stripped before remote calls.
- Schema-valid search results are checked against the requested account, folder, reference and read/attachment flags. Body, metadata and draft reads must return the requested identity. A mismatch is a per-operation `RESULT_SCOPE_MISMATCH`, not a fabricated result or a disconnect of all capabilities.
- Mail instructions request result-only speech, number-only count answers, original full-body reading rather than previews, preservation of the user's mailbox naming, and no unsolicited attachment narration during counts/reading. Existing send confirmation, idempotency, read-only reading, Trash-only deletion and untrusted-mail rules remain in place.

## Verification performed here

`PYTHONPATH=packages/dagmar-server/src python -m pytest -q apps/kajovo-hotel-api/tests/test_voice_mail_query.py`

Result: **36 passed**. These are offline unit regressions using synthetic pages, not real mailbox or voice end-to-end tests. Changed Python sources also passed compilation. The original `mail.py` was reconstructed byte-for-byte and checked against Git blob `afff08941fe218f7b5a2778b7f2f5f9cf671919b` before modification.

The count result explicitly reports `basis: "synchronized_index"`. This is not an atomic live IMAP count. Unchanged page synchronization metadata alone cannot prove the index reflects changes occurring on the mail server after synchronization.

## Still required for the user's complete request

This change is **not** a claim that the entire mail integration has been rebuilt or accepted:

1. Verify the actual reception/operations misrouting against correlated human transcript, chosen tool arguments and returned messages. The earlier claim that a particular alias mapping caused it was not established. An explicit model-facing account is not a backend proof that it matches human intent.
2. Implement authoritative per-call mailbox/folder selection and ordered result-set state, with stable ordinal selection and deterministic individual/bulk dispatch. Instructions alone are not backend selection state. Preserve the complete target set and per-message outcomes; do not treat a first page as all results or replay uncertain mutations under new identities.
3. Verify full-body narration, pagination, long messages, stop/resume and actual spoken-text coverage in the voice lifecycle. A prompt requesting full text is not proof that short global response limits or interruption handling permit complete narration.
4. Verify search/index coverage of the complete requested mailbox corpus and folders. For live mailbox totals, implement or verify a suitable server-side count/snapshot contract and synchronize any required client/server contract changes together.
5. Run the full existing application/voice suite, provider-schema acceptance and real end-to-end acceptance. Do not declare production fixed merely because unit tests, transport health or deployment passed.

No changes are made to the read-only Kajovo inspection MCP, Home Assistant MCP, SMTP confirmation rules, credentials, GitHub protections or deployment/rollback policy. No real messages were sent, moved, deleted or marked read during these tests.
