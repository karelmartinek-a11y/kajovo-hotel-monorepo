# Android production acceptance

The `Android Production Acceptance - Kajovo Hotel` workflow is a manual, production-writing verification. It is intentionally opt-in: choose `room-203-and-one-admin-chat` for `confirm_mutations`; the default `no` performs no job. It uses the repository's protected administrator credentials without printing them.

The script creates a randomly named, temporary housekeeping employee, reads room 203's current status, changes it to a different supported status, verifies the change, restores and verifies the exact prior status, then sends one visibly labeled chat message to the active administrator participant. It confirms the message appears in that administrator's conversation and deletes the temporary employee in cleanup. If the original room status is not a recognized reversible value, it stops before changing the room. A cleanup failure fails the workflow and identifies whether room restoration or account removal needs attention.

The workflow verifies chat persistence and administrator visibility through the live API. It does not claim that a push notification reached an administrator device unless that device has a registered delivery token and a separate device-level receipt is observed.

## Change impact matrix

| Area | Decision | Evidence / scope |
| --- | --- | --- |
| Production app and API | Verify unchanged | The verifier uses existing employee, housekeeping, user-management, and chat API contracts; it adds no runtime endpoint. |
| Tests | Add | Manual live acceptance covers an exact room-state rollback, administrator chat visibility, and temporary-user cleanup. |
| CI and release workflows | Add | A separate manual workflow defaults to no mutations and requires the explicit production acceptance choice. |
| Current-state documentation | Update | This runbook and the Android parity audit describe the production scenario and its evidence boundary. |
| Comments and operational notes | Verify unchanged | The test purpose and safe cleanup are documented here; no code comments or credentials are added. |
| `AGENTS.md` | Verify unchanged | The repository workflow and security rules remain applicable without new standing development requirements. |
| Fixtures, translations, and user text | Not applicable | The script uses a clearly labeled Czech test message; it does not alter fixtures or product translations. |
| Build, OpenAPI, deploy | Verify unchanged | No app, API schema, generated client, or deploy configuration changes; the new workflow runs only when manually dispatched. |
