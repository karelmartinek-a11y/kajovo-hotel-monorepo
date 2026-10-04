# Dagmar recovery and compatible rollback

Stage B imports legacy tables once into `dagmar_*`; source tables remain unchanged.
After the first shared-space write, Stage A is **not** a compatible voice rollback:
it would silently read an old private snapshot. Do not downgrade the schema or
restore the pre-migration dump over the live database.

Before deployment, retain the protected SQL/roles dump, release environment and
independent diagnostic content key under
`/home/deploy-hotel/kajovo-protected-backups/dagmar-20261004-stage-b` (0700/0600).
The environment contains the separate provider master key. Never include either
key in Git, an export manifest or a CI artifact.

A failed release is recovered by a main-only corrective/revert commit that retains
`dagmar-server` schema v1, migration marker, shared principal and namespaced
receipts. Revert only the affected behavior/browser code. That compatible commit
must pass the normal exact-SHA CI/deploy gate. Keep the currently deployed B image
until its replacement has passed runtime validation. Never activate Stage A's old
voice routes against post-migration data. If a compatible repair is not ready,
stop accepting voice calls rather than presenting stale memory or replaying writes;
hotel non-voice endpoints and databases remain available.

For storage disaster recovery, stop writes and restore the **latest Dagmar-era**
backup plus its matching environment/keys into an isolated database first. Verify
schema marker, source lineage, own counts/checksums and uncertain operation IDs.
Recover sent operations through their original request IDs. Promote recovered data
only after explicitly assessing writes since the backup; an old backup is never an
automatic rollback. Diagnostic data uses its own volume/key and cannot replace
memory or confirmation journals. Preserve the independent diagnostic volume when
replacing application code.

The executable drill is:

```
python3.11 scripts/verify_dagmar_recovery.py --backup-dir <protected-directory> --api-image <compatible-image> --evidence <sanitized-proof.json>
```

It uses an internal Docker network and PostgreSQL 16.4, imports the protected
snapshot, runs the own migration, commits an isolated new fact/receipt, dumps the
post-migration database and restores it into a second database. The reopened
compatible runtime must replay the original receipt and read the new fact, decrypt
the preserved provider credential and read the independently restored diagnostic
key. It performs no provider/MCP call. On Colima, choose a Docker-shared directory
under `/Users`; use `--mount` so an absent file cannot silently become a directory.
Failures remain in the protected directory. The output contains no private content.

[Actual restore and key proof](evidence/stage-b-recovery.json) establishes data/key
recovery with schema v1. It does not claim that every hypothetical old application
commit is compatible, or authorize replacing the production database.

## Stabilization v2

The index upgrade is additive (allocation/totals, producer_final, user_version 2).
B/J batched objects coexist with old E/M records and retain each record checksum.
A compatible rollback retains the v2 reader/accounting and current memory schema.
The pre-stabilization 33f15b binary alone cannot read B objects: it is **not** an
automatic rollback target once new records are written. Roll back an application
regression with a forward main commit preserving storage compatibility and keys.
Never replace the live DB or diagnostic store with the pre-release backup.
For disaster recovery, restore the latest protected snapshot/key into an isolated
directory/DB, validate hashes and inventory, then separately assess later writes.
Historical audio/manifest gaps remain evidence; repair is explicit and preserves
unknown capture/init rather than rewriting the incident as a complete recording.
