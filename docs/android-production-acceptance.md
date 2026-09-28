# Android production acceptance

The `Android Production Acceptance - Kajovo Hotel` workflow is a manual, production-writing verification. It runs only from `main` in the `production` environment and is intentionally opt-in: choose `room-203-and-one-admin-chat` for `confirm_mutations`; the default `no` performs no job. The administrator password comes only from the protected GitHub secret and is never printed.

The script creates a randomly named, temporary housekeeping employee, then requires room 203 to be free with no arrivals, departures, or stays. It rereads the room immediately before mutation and persists a restore plan before changing its status. It verifies the probe, checks the current state again, restores and verifies the exact prior status, then sends one visibly labeled chat message to the active administrator participant. An always-run cleanup step restores only if the room still has the test value and remains free with no events, and removes the temporary employee. If another value is present, cleanup preserves it and fails for manual review. All HTTP requests have a 10-second timeout.

Message verification requires the exact current run ID in the body; a prior run's message cannot satisfy the check. The workflow is serialized and cannot be canceled by a later dispatch.

The workflow verifies chat persistence and administrator visibility through the live API. It does not claim that a push notification reached an administrator device unless that device has a registered delivery token and a separate device-level receipt is observed.

## Change impact matrix

| Area | Decision | Evidence / scope |
| --- | --- | --- |
| Production app and API | Verify unchanged | The verifier uses existing employee, housekeeping, user-management, and chat API contracts; it adds no runtime endpoint. |
| Tests | Add | Manual live acceptance covers an exact room-state rollback, administrator chat visibility, and temporary-user cleanup. |
| CI and release workflows | Add | Manual workflow defaults to no mutations, requires explicit authorization, runs only from `main` in `production`, and always attempts safe cleanup. |
| Current-state documentation | Update | This runbook and the Android parity audit describe the production scenario and its evidence boundary. |
| Comments and operational notes | Verify unchanged | The test purpose and safe cleanup are documented here; no code comments or credentials are added. |
| `AGENTS.md` | Verify unchanged | The repository workflow and security rules remain applicable without new standing development requirements. |
| Fixtures, translations, and user text | Not applicable | The script uses a clearly labeled Czech test message; it does not alter fixtures or product translations. |
| Build, OpenAPI, deploy | Verify unchanged | No app, API schema, generated client, or deploy configuration changes; the new workflow runs only when manually dispatched. |
