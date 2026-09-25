# IA schema (`apps/kajovo-hotel/ux/ia.json`)

## Navigation

`navigation.rules` controls grouping and the supplementary phone menu. All authorized active modules appear directly in the navigation row or desktop sidebar:

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

The explicit `other` module remains inactive; the phone menu lists the same authorized modules as the direct navigation row.
