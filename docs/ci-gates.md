# CI Gates (Manifest compliance)

These checks are blocking for any release, based on Manifest.md:

1) Token-only styling: reject ad-hoc values for colors/spacing/radius/elevation/duration/easing/z-index/component states.
2) SIGNACE presence:
   - present on every view outside PopUp (min 1, max 2 brand elements per view)
   - visible on scroll, not covered by overlays (cookie/chat/etc.)
   - #FF0000 background, #FFFFFF text, label KÁJOVO, Montserrat Bold
3) Responsive classes:
   - Phone 360–480, Tablet 768–1024, Desktop 1280–1920
   - no horizontal scroll except inside table containers
4) View completeness: every view must implement finished states:
   loading, empty, error, offline/maintenance, 404 (and interactive states where applicable).
5) Accessibility: minimum WCAG 2.2 AA; keyboard focus visible.

Codex refactor should implement automated tests for all of the above.
