# IA schema (`apps/kajovo-hotel/ux/ia.json`)

## Navigation

`navigation.rules` supports responsive overflow and phone drawer behavior:

- `maxTopLevelItemsDesktop` (required)
- `maxTopLevelItemsTablet` (optional; defaults to desktop limit minus 2)
- `overflowLabel` (required)
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

## Migration notes (1.1.x -> 1.2.x)

1. Keep existing module shape; no mandatory field changes.
2. Add `navigation.sections` progressively.
3. Add per-module `section` where grouping should be explicit.
4. Add `maxTopLevelItemsTablet`, `phoneDrawerLabel`, and `phoneSearchPlaceholder` to tune responsive navigation.
5. The legacy explicit `other` module can remain in IA but should be `active: false` when overflow menu handles "Další" automatically.
