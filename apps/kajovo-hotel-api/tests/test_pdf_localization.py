from datetime import date
from io import BytesIO
from types import SimpleNamespace

import pytest
from pypdf import PdfReader

from app.services.pdf.breakfast import build_breakfast_schedule_pdf
from app.services.pdf.inventory import build_inventory_stocktake_pdf


@pytest.mark.parametrize("locale,title,status", [
    ("cs", "Přehled snídaní", "Připravuje se"),
    ("en", "Breakfast schedule", "Preparing"),
    ("uk", "Огляд сніданків", "Готується"),
])
def test_breakfast_pdf_renders_unicode_and_all_rows(locale: str, title: str, status: str) -> None:
    orders = [SimpleNamespace(room_number=str(number), guest_name="Новáková Їжак", guest_count=2, status="preparing") for number in range(100, 170)]
    pdf = build_breakfast_schedule_pdf(orders, service_date=date(2026, 9, 25), locale=locale)
    reader = PdfReader(BytesIO(pdf))
    content = "\n".join(page.extract_text() for page in reader.pages)
    assert len(reader.pages) > 1
    assert title in content and status in content
    assert "Новáková Їжак" in content
    assert "100" in content and "169" in content
    assert "?" not in content


@pytest.mark.parametrize("locale,title", [
    ("cs", "Inventurní soupis"),
    ("en", "Stocktake report"),
    ("uk", "Інвентаризаційний опис"),
])
def test_stocktake_pdf_renders_account_language(locale: str, title: str) -> None:
    items = [SimpleNamespace(name="Рушник červený", current_stock=12, amount_per_piece_base=2, unit="ks")]
    pdf = build_inventory_stocktake_pdf(items, stock_date=date(2026, 9, 25), locale=locale)
    content = "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)
    assert title in content
    assert "Рушник červený" in content
