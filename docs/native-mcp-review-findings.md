# Native MCP review finding mapping

Hotfix branch starts from hotel main e5647b5ffc91917a3152a97df646efc00a2cbf94. PR #123 replaces the incomplete acceptance claim for PR #122. Local verification below is development evidence; exact final commit CI and content-bound Independent Codex multi-agent forensic review are separately required before merge and deployment.

| PR #122 thread / finding | Fixed source/symbol | Regression evidence | Local result |
|---|---|---|---|
| r4153276778 credential in validation input | voice-core-server/contracts.py McpServerConfig: hide_input_in_errors, SecretStr, explicit session_tool unwrap | test_policy.py test_mcp_validation_error_never_discloses_credentials (malformed URL, empty/duplicate allowlist, invalid approval/extra field, repr/serialization/log canary) | PASS |
| r4153276833 competing signing authority | deploy-production.yml removes GitHub key; github_deploy_via_ssh.py preserves derived private host env and compares canonical fingerprint | test_github_deploy_via_ssh.py test_mcp_secret_has_one_server_owned_authority | PASS |
| r4153276888 unhandled invalid configuration | mcp_provider.py HomeAssistantMcpProvider.tools translates validation to VoiceError capability_not_configured | test_voice_core.py test_invalid_mcp_host_config_is_safe_503 (HTTP/log/audit canary) | PASS |
| r4153276959 empty production URL override | compose.prod.yml explicit canonical production fallback | test_github_deploy_via_ssh.py test_absent_mcp_url_has_environment_specific_compose_default | PASS |
| r4153277002 empty staging URL override | compose.staging.yml explicit staging-only fallback | same absent-env regression, distinct staging host | PASS |
| r4153277056 approval wire untested | runtime.ts VoiceRealtimeClient.approve(requestId, decision) | runtime.test.mjs exact sent event for approve/deny, promotion, stale ID, duplicates, Stop/reconnect and late callbacks | PASS |
| r4153277124 internal devices in Actions logs | verify_live_voice_mcp.mjs aggregate-only console output; device data transient only | grounding assertions retain transient data; stdout regression verifies aggregate-only result; no device artifacts | PASS |
| r4153348780 double click consumes next request | runtime.ts exact rendered ID consumed before send; ui.tsx captured ID, keyed prompt and double-click event suppression | runtime.test.mjs A/B approve and deny; console.spec.ts real dblclick A leaves B pending across desktop/tablet/mobile Chromium and mobile WebKit | PASS |
| r4153462541 missing approval response item ID | runtime.ts unique mcp_approval_ + random UUID hex | runtime.test.mjs exact conversation.item.create serialization and distinct IDs for A/B | PASS |

Official wire contract checked 2026-10-01: [Realtime MCP guide](https://developers.openai.com/api/docs/guides/realtime-mcp) and [Realtime client events](https://developers.openai.com/api/reference/resources/realtime/client-events). Approval item includes id, type, approval_request_id and approve; rejection uses approve=false. No custom execution bridge is restored.

Coordinated agentha PR #4 adds isolated temporary loopback 18103 preflight with production HA, policy, stable registry and canonical host key. Canonical listener remains 8103. Rollback is protected until native Realtime import and grounded canonical read acceptance pass, then legacy cleanup occurs. No actuator smoke runs.
