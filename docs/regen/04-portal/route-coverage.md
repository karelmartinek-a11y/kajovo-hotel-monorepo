# 04 Portal — Route coverage

## Scope
Mapování IA route -> React komponenta -> implementační stav -> důkaz v testech pro Portal entrypoint (`apps/kajovo-hotel-web/src/main.tsx`).

## Coverage matrix

| IA route / view key | Komponenta v portal app | Stav | Test evidence |
| --- | --- | --- | --- |
| `/` (`dashboard`) | `Dashboard` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` (`all IA routes support smoke navigation`, `WCAG 2.2 AA baseline for IA routes`) |
| `/snidane` (`breakfast_list`) | `BreakfastList` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` + `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/snidane/nova` | `BreakfastForm` (`mode="create"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/snidane/:id` (`breakfast_detail`) | `BreakfastDetail` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/snidane/:id/edit` | `BreakfastForm` (`mode="edit"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/ztraty-a-nalezy` (`lost_found_list`) | `LostFoundList` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/ztraty-a-nalezy/novy` | `LostFoundForm` (`mode="create"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/ztraty-a-nalezy/:id` (`lost_found_detail`) | `LostFoundDetail` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/ztraty-a-nalezy/:id/edit` | `LostFoundForm` (`mode="edit"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/zavady` (`issues_list`) | `IssuesList` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/zavady/nova` | `IssuesForm` (`mode="create"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/zavady/:id` (`issues_detail`) | `IssuesDetail` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/zavady/:id/edit` | `IssuesForm` (`mode="edit"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/sklad` (`inventory_list`) | `InventoryList` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/sklad/nova` | `InventoryForm` (`mode="create"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/sklad/:id` (`inventory_detail`) | `InventoryDetail` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/sklad/:id/edit` | `InventoryForm` (`mode="edit"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/hlaseni` (`reports_list`) | `ReportsList` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/hlaseni/nove` | `ReportsForm` (`mode="create"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/hlaseni/:id` (`reports_detail`) | `ReportsDetail` | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/hlaseni/:id/edit` | `ReportsForm` (`mode="edit"`) | DONE | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `/login` | `PortalLoginPage` | DONE | `apps/kajovo-hotel-web/tests/rbac-access.spec.ts` |
| `/intro` (`intro`) | `IntroRoute` (lazy import z `routes/utilityStates`) | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/offline` (`offline`) | `OfflineRoute` (lazy import z `routes/utilityStates`) | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/maintenance` (`maintenance`) | `MaintenanceRoute` (lazy import z `routes/utilityStates`) | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/404` (`not_found`) | `NotFoundRoute` (lazy import z `routes/utilityStates`) | DONE | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` |
| `/dalsi` (`other`, inactive module) | `<Navigate to="/" replace />` | DONE (redirect policy) | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |
| `*` fallback | `<Navigate to="/404" replace />` | DONE (fallback policy) | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts` |

## Notes
- Modul `other` z IA je `active: false`; v Portal app je explicitně řešen redirectem, nikoliv samostatným view.
- Všechny module routes jsou navíc kryté RBAC guardem (`isAllowed(...)`) a pro deny stav vrací `AccessDeniedPage`.
