# Android employee parity audit — 2026-09-28

## Runtime scope

The reference is the live employee portal at `https://hotel.hcasc.cz/login`. The native application includes employee roles and employee operations only; administration remains on the web. The Android route registry and role guards are implemented in `android/app/src/main/java/cz/hcasc/kajovohotel/app/PortalRoutes.kt`, `RootDestinationResolver.kt`, and `KajovoHotelApp.kt`. Employee destinations are reception, housekeeping, breakfast, lost and found, issues, inventory, reports, profile, password change, and chat. Breakfast and reports have create, detail, and edit destinations. Login, role selection, blocking update, offline, maintenance, access denied, and global error states are also routed.

## Current employee view matrix

| View | Employee access | UI states / inputs inspected in source | API / validation boundary | Snapshot |
| --- | --- | --- | --- | --- |
| Login | Unauthenticated | CS/EN/UK selector, username/password, disabled submit until valid input, visible request-reset entry, inline auth errors | Auth API; generic password-reset request response | Native login in all three locales; live mobile web login and APK offer |
| Password reset request | Unauthenticated | Email input, local validation, progress, generic success/error | Anonymous request endpoint, same response for account presence, per-email throttle | API tests; no live email was sent |
| Password reset completion | Link recipient | Token/password inputs, validation and invalid/expired-token result | Existing token reset contract | Code and API contract inspected |
| Role selection | Multi-role employee | Assigned roles only; routes re-evaluate role access | Session role selection | No authenticated production screenshot |
| Reception | Reception | Reception overview and role-allowed quick links | Existing reception API | Source inspected; no authenticated production screenshot |
| Housekeeping | Housekeeping | Room board, state update and returned error/reload state | Existing room proxy contract | Source inspected; explicitly confirmed production acceptance changes only room 203 and restores its exact prior status |
| Breakfast list/create/detail/edit | Breakfast and reception roles as registered | Forms, list/detail/edit navigation, validation states | Existing breakfast API | Source inspected; no authenticated production screenshot |
| Lost and found | Reception | List and employee actions | Existing lost-found API | Source inspected; no authenticated production screenshot |
| Issues | Maintenance | List, create/update state and errors | Existing issue API | Source inspected; no authenticated production screenshot |
| Inventory | Inventory | List, entry and report navigation | Existing inventory API | Source inspected; no authenticated production screenshot |
| Reports list/create/detail/edit | Reception and inventory | Form/list/detail/edit navigation and validation | Existing reports API | Source inspected; no authenticated production screenshot |
| Profile/password change | Authenticated employee | Profile state and password change form | Existing session/profile API | Source inspected; no authenticated production screenshot |
| Internal chat | Employee portal actor only | Conversation list, unread state in the chat and navigation badge, message load/send and polling | Existing `/api/v1/chat` endpoints; admin actor is denied native route; FCM sends data-only event without message content | A single, visibly labeled production acceptance message to the administrator is authorized; the manual workflow verifies its presence in the admin conversation |
| Chat notification | Employee app with Android notification permission | Token registration and rotation, generic lock-screen notification, tap-through to matching conversation; CS/EN/UK notification text | Employee-only FCM token API and data-only payload; retries track successful device tokens | Source/API tests inspected; production delivery awaits deployment and signed app |
| Update/offline/system states | Employee app | Known mandatory update blocks all app routes; retry when metadata is offline; previously verified optional version can start offline | Release manifest and version header; API returns 426 for stale clients when release is mandatory | Unit and instrumented test coverage |

## Mobile shell and localization

The native shell retains the top bar and fixed bottom navigation while feature content owns vertical scrolling. Employee screens use the shared localization assets for Czech, English, and Ukrainian. Current screenshots were captured on the 720 × 1280 Android API 35 emulator:

- `docs/screenshots/android-2026-09-28/android-login-cs.png`
- `docs/screenshots/android-2026-09-28/android-login-en.png`
- `docs/screenshots/android-2026-09-28/android-login-uk.png`
- `docs/screenshots/android-2026-09-28/android-reset-request-uk.png`
- `docs/screenshots/android-2026-09-28/web-login-phone.png`
- `docs/screenshots/android-2026-09-28/web-login-phone-scroll.png`

The live mobile web login screenshot shows release 2.0.4 NG and the APK offer because Chrome cannot reliably prove installation in this emulator. The offer uses `getInstalledRelatedApps()` where available and falls back to displaying the download offer where installation status is unknown. The site web manifest names the Android package. The debug APK uses a different package suffix, so it is intentionally not treated as the production application.

## Limits and remaining evidence

Production authenticated employee screenshots, a live login failure, and device-level FCM delivery remain unverified. The Firebase project and production/debug Android clients are configured; the least-privilege sender service account key is held in GitHub Actions secret storage and is not part of this repository. The production API/web changes are deployed, and a signed APK has been built and verified; the mandatory public release manifest is being published separately. The instrumented suite covers app routing/readability and the login surface, but does not prove complete API-backed parity for every role and form.

The live screenshots are evidence of the stated routes and layout only; they do not replace role-by-role production interaction tests. A manual, main-only production acceptance workflow is authorized to test room 203 only when it is free and has no arrivals, departures, or stays, restore its prior status, and verify one labeled employee message in the active administrator's conversation. That chat check proves message visibility, not FCM delivery to a device; push receipt needs a registered device token and separate device-level evidence.
