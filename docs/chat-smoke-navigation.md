# Chat smoke navigation

The Chat navigation accessible name includes its unread badge. Smoke identifies
the link by its chat destination and exact visible Chat label, and the real
employee-to-admin scenario verifies the positive unread accessible description.
Production UI, unread polling, message delivery and badge accessibility stay unchanged.

## Impact matrix

| Category | Disposition |
| --- | --- |
| Production source | Verify unchanged: ChatUnreadLink and all consumers. |
| Tests | Update admin smoke destination/label selector and positive unread assertion. |
| CI/release | Verify unchanged unified release gate executes this suite. |
| Documentation | Update this current test contract and independent review evidence. |
| Comments/notes | No changed production comments. |
| Instructions | Update root AGENTS with accessible unread selector rule. |
| Fixtures/text | Verify existing synthetic employee/admin fixtures unchanged. |
| Build/API/deploy | Verify unchanged; no endpoint or generated-client change. |

A missing conversation in CI run 36882288610 has not been reproduced by local
full-suite or distinct-admin runs. It is not attributed to browser focus or
identity without evidence; the conversation assertion remains unchanged.
