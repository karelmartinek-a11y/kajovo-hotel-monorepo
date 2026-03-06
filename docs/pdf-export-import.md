# PDF export/import flows

## Snídaně (Admin + Portal)

- **Import** – front‑end file input on `/snidane` (Czech UI) uploads a `.pdf` to `/api/v1/breakfast/import`. Roles `recepce`/`admin` can preview the parsed rows, adjust diet flags, and persist the data. The backend parses the breakfast schedule using `app.services.breakfast.parser`, stores the `BreakfastOrder` rows, and archives the original asset under `KAJOVO_API_MEDIA_ROOT/breakfast/imports`.
- **Export** – the new `GET /api/v1/breakfast/export/daily?service_date=YYYY-MM-DD` endpoint builds a simple PDF summary (`app.services.pdf.breakfast.build_breakfast_schedule_pdf`) and returns it as a download (`Content-Disposition: attachment`). The Export button lives beside the import controls on `/snidane` and is enabled for recepce/admin roles. The export respects the currently selected service date so hotel staff can print the current day’s plan.

## Sklad: inventurní protokol

- The inventory list pages in Admin and Portal already expose the `/api/v1/inventory/stocktake/pdf` endpoint through the “Inventurní protokol (PDF)” button. The backend generates the PDF with `app.services.pdf.inventory.build_inventory_stocktake_pdf`.

## Testing & Audit

- API coverage lives in `apps/kajovo-hotel-api/tests/test_breakfast.py` and `.../test_inventory.py`, including production smoke checks for the new export endpoint. Exported PDFs are validated for MIME type and that textual markers such as `Datum:` appear when data exists.

Keep these flows in sync with the UI so that the API + UI combination satisfies the PDF audit demand without unnecessary library dependencies.
