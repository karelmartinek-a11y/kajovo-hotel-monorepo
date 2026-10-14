# Public guidance revision compatibility — 2026-10-14

Observed active runtime: HA2.1.26/r3 guidance2026-10-14.1 and voice76f9b7c. The installed client's authenticated initialize/tools/list/canonical-contract handshake fails mcp_incompatible. Compared with its frozen ha_correction fixture, the only non-annotation schema difference is outputSchema.properties.guidance_version.const (2026-10-13.3 → 2026-10-14.1).

| Area | Decision |
|---|---|
| Production client | update only known HA guidance label comparison; actual validators retain the current canonical schema |
| Tests | update positive guidance refresh and negative integrity/profile/business-schema/output-label cases |
| CI/deploy | verify full release_gate and exact main CI/image; standard api-admin deployment |
| Current docs | update additive metadata semantics and runtime failure/recovery evidence |
| Comments/instructions | update narrowly; preserve current transport, generation, consent, receipt and ACK fences |
| Fixtures | verify current pinned historical fixtures remain accepted; exercise a future canonical guidance revision |
| Build/generators | verify no dependency/schema/migration changes; actual package/image and public handshake |
| Host DB, Mail, browser/DSP, reservations | unchanged; no business mutations or paid provider/audio tests |

New server guidance must remain bound to its canonical digest, known profile and actual output constant. A revision label cannot relax any input/output business constraint or re-enable a client without its existing exact model ACK.
