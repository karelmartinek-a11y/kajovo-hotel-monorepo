# Refactor Audit Report (hotel.hcasc.cz frontend)

## Scope reviewed
- all templates in `templates/`
- shared shell in `templates/base.html`
- shared styling layers in `static/`

## What was verified and enforced in this step
1. All admin screens now render their primary body via `block body_content`.
2. Sidebar duplication in admin bodies was removed; sidebar is injected through the shell.
3. New independent responsive layer `static/factory-ui.css` was added with explicit breakpoints:
   - Desktop (`min-width: 1180px`)
   - Tablet (`768px – 1179px`)
   - Mobile (`max-width: 767px`)
4. `templates/base.html` now loads `factory-ui.css` as the final stylesheet so the factory layer controls visible output.

## Remaining objective for strict “from zero” criterion
- final pass must rewrite the remaining deep admin content blocks (complex inventory/report forms) into the new class system without legacy inline styling fragments.
- after that pass, legacy style layers can be removed fully.

