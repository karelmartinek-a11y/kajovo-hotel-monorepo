# Historical voice speaker interruption impact matrix

Historical baseline: main ab60a2c42148ea1010a28b7351c511a432e5d9a2. Original dirty checkout is untouched.

| Category | Scope |
|---|---|
| Runtime source | Inspect browser microphone/playback lifecycle and hotel sideband response ordering; fix only reproduced interruption |
| Tests | Paid real WebRTC silent startup, residual speaker echo and subsequent user turn; lifecycle unit regressions |
| CI/gates | Existing complete 23 gates and Docker/proxy checks; paid calls outside CI |
| Docs/SSOT/comments/AGENTS | Synchronize the implemented acoustic policy and its evidence limits |
| API/data/migrations/generated clients | Verify unchanged unless runtime investigation requires a contract change |
| Deployment | Main-only exact-SHA CI and production deployment, then real provider acceptance |

No mail send, mailbox mutation, HA control or secret disclosure. Simulated acoustic return is separate from physical testing on the user's speaker/microphone setup.

Reproduction on baseline: silent startup had 0 speech/response/audio events; simulated residual speaker return produced 11 speech starts during output, 11 cancellations/clears, and 0 completed playbacks. Fix: generic optional browser acoustic policy, enabled by hotel adapter; headphone opt-out and manual interruption. API/database/catalog/HA/MAIL servers unchanged. Unit lifecycle tests pass; full gate, exact-SHA deployment and paid regression are required before closure.

Provider-confirmed `output_audio_buffer.stopped` drains the entire WebRTC playback buffer. Its response ID can differ from the start event in a real call. The acoustic gate clears globally on drain/clear and waits for the tail; a new start cancels that pending release. Registry action consent continues to require its exact backend response proof. The paid regression verifies that microphone input is live again before the next turn.

This mic-gate implementation is superseded by the approved 2026-10-04 Dagmar Stage B assignment. The final runtime removes the speaker checkbox, playback input gate and manual interruption. Native synthetic barge-in passed; the user cancelled mandatory physical iPhone acceptance. Historical simulated echo does not establish current physical acoustic success. See [current protocol](dagmar/IMPLEMENTATION.md).
