# Accessibility Checklist

This lightweight checklist targets the most critical flows that changed as part of the WCAG 2.1 AA remediation:

1. **Login page**
   * Labels drive the `Admin email` and `Admin heslo` inputs, and both inputs reference the form description via `aria-describedby`.
   * Error and hint messages announce via their `role` attributes and do not vanish from the accessibility tree.
2. **Global layout / header / menu**
   * A skip link targets `#main-content` and becomes visible on focus.
   * The primary `<nav>` exposes `role="navigation"` with an appropriate `aria-label`.
   * Desktop navigation links show high-contrast focus (dark fill on red/white text) and the overflow menu items share the same treatment.
3. **Admin dashboard**
   * Each dashboard card is a `<section>` with a heading to give a clear structure for screen readers.
   * Focus styles remain visible when tabbing through the toolbar and cards.
4. **Users management forms**
   * Helper text for the phone inputs and note areas have IDs and are referenced via `aria-describedby`.
   * The inline status region surrounding error/info messages has `aria-live="polite"` so announcements occur when content changes.

## Manual validation steps

1. Open `/admin/login`:
   * Tab through the inputs, confirm they announce “Admin email” / “Admin heslo”, and observe the focus outline.
   * Trigger an error (e.g., submit empty) and verify the error message appears with `role="alert"`.
2. From any admin page:
   * Tab to the skip link, activate it, and confirm focus lands on the main content (`#main-content`).
   * Tab through the navigation links and overflow button; focus outlines should remain visible and contrast with the background.
3. Visit `/admin/uzivatele`:
   * Focus the phone inputs and ensure screen readers read the helper note (IDs are exposed via `aria-describedby`).
   * Trigger a validation error (e.g., type an invalid phone) and verify the error text appears with a proper ID if needed.
   * Open the delete confirmation dialog; ensure focus moves into the dialog and returns to the trigger after closing.

Keep this file updated whenever these key areas change.
