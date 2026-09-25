from __future__ import annotations

from datetime import date

from app.db.models import InventoryItem
from app.services.pdf.layout import render_table_pdf

COPY = {
    "cs": ("Inventurní soupis", "Datum", ["Položka", "Stav skladu", "Množství v 1 ks", "Jednotka"], "Žádné položky."),
    "en": ("Stocktake report", "Date", ["Item", "In stock", "Quantity per item", "Unit"], "No items."),
    "uk": ("Інвентаризаційний опис", "Дата", ["Позиція", "Залишок", "Кількість в одиниці", "Од. виміру"], "Позицій немає."),
}


def build_inventory_stocktake_pdf(items: list[InventoryItem], *, stock_date: date, locale: str = "cs") -> bytes:
    title, date_word, headers, empty = COPY.get(locale, COPY["cs"])
    rows = [[item.name, str(item.current_stock), str(item.amount_per_piece_base or 0), item.unit] for item in items]
    return render_table_pdf(title=title, date_label=f"{date_word}: {stock_date.isoformat()}", headers=headers,
                            rows=rows, column_widths=[210, 80, 120, 78], empty_label=empty)
