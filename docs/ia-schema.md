# IA schema (`apps/kajovo-hotel/ux/ia.json`)

## Navigation

`navigation.rules` controls grouping of the role-filtered modules in the shared, horizontally scrollable bottom navigation. Chat is pinned first and Profil last on phone, tablet, and desktop:

- `grouping` (required)
- `enableSearchInMenuOnPhone` (optional)
- `phoneDrawerLabel` (optional)
- `phoneSearchPlaceholder` (optional)

`navigation.sections` is optional and defines groups rendered in AppShell navigation:

```json
{
  "navigation": {
    "sections": [
      { "key": "overview", "label": "Přehled", "icon": "layout-dashboard", "order": 1 },
      { "key": "operations", "label": "Provoz", "icon": "briefcase", "order": 2 },
      { "key": "records", "label": "Evidence", "icon": "folder", "order": 3 }
    ]
  }
}
```

## Modules

Each `modules[]` item now accepts additional optional metadata without breaking existing modules:

- `section`: maps item to `navigation.sections[].key`
- `icon`: icon token identifier
- `permissions`: permission tags for future filtering

All previous fields remain valid (`key`, `label`, `route`, `active`, `routes`).

The explicit `other` module remains inactive. Both web surfaces expose the same authorized active modules in the shared bottom row; the portal retains its quick housekeeping, lost-found, and issue actions. The native Android application has its own navigation and is not changed by the web chat.
