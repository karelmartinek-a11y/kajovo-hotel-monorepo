from __future__ import annotations

from datetime import date

from app.db.models import BreakfastOrder
from app.services.pdf.layout import render_table_pdf

COPY = {
    "cs": ("Přehled snídaní", "Datum", ["Pokoj", "Host", "Počet", "Stav"], "Žádné záznamy.", {"pending": "Čeká", "preparing": "Připravuje se", "served": "Vydáno", "cancelled": "Zrušeno"}),
    "en": ("Breakfast schedule", "Date", ["Room", "Guest", "Guests", "Status"], "No records.", {"pending": "Pending", "preparing": "Preparing", "served": "Served", "cancelled": "Cancelled"}),
    "uk": ("Огляд сніданків", "Дата", ["Номер", "Гість", "Кількість", "Стан"], "Записів немає.", {"pending": "Очікує", "preparing": "Готується", "served": "Подано", "cancelled": "Скасовано"}),
}


def build_breakfast_schedule_pdf(orders: list[BreakfastOrder], *, service_date: date, locale: str = "cs") -> bytes:
    title, date_word, headers, empty, statuses = COPY.get(locale, COPY["cs"])
    rows = [
        [str(order.room_number or "-"), str(order.guest_name or "-"), str(order.guest_count or 0), statuses.get(str(order.status), str(order.status or "-"))]
        for order in orders
    ]
    return render_table_pdf(title=title, date_label=f"{date_word}: {service_date.isoformat()}", headers=headers,
                            rows=rows, column_widths=[65, 253, 65, 105], empty_label=empty)
