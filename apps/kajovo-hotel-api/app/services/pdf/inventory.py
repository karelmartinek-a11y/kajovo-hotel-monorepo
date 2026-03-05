from __future__ import annotations

from datetime import date

from app.db.models import InventoryItem


def _sanitize(text: str) -> str:
    return "".join(ch if 32 <= ord(ch) <= 126 else "?" for ch in text)


def build_inventory_stocktake_pdf(items: list[InventoryItem], *, stock_date: date) -> bytes:
    title = _sanitize("Inventurni soupis")
    date_line = _sanitize(f"Datum: {stock_date.isoformat()}")
    lines = [title, date_line, ""]
    for item in items:
        name = _sanitize(item.name)
        unit = _sanitize(item.unit)
        amount = item.amount_per_piece_base or 0
        line = f"{name} | sklad: {item.current_stock} ks | 1 ks: {amount} {unit}"
        lines.append(_sanitize(line))

    content_lines = []
    y_offset = 800
    for line in lines:
        content_lines.append(f"50 {y_offset} Td ({line}) Tj")
        y_offset -= 16
        if y_offset < 60:
            break

    content = "BT\n/F1 12 Tf\n" + "\n".join(content_lines) + "\nET\n"
    content_bytes = content.encode("latin-1", errors="replace")

    objects: list[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Length " + str(len(content_bytes)).encode("ascii") + b" >>\nstream\n" + content_bytes + b"endstream")

    result = b"%PDF-1.4\n"
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(result))
        result += f"{i} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"

    xref_offset = len(result)
    result += b"xref\n0 " + str(len(objects) + 1).encode("ascii") + b"\n"
    result += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        result += f"{offset:010d} 00000 n \n".encode("ascii")
    result += b"trailer\n<< /Size " + str(len(objects) + 1).encode("ascii") + b" /Root 1 0 R >>\n"
    result += b"startxref\n" + str(xref_offset).encode("ascii") + b"\n%%EOF\n"
    return result
