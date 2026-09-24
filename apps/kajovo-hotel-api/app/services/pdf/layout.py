"""Unicode PDF layout shared by portal exports."""

from __future__ import annotations

from html import escape
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

FONT_NAME = "KajovoMontserrat"
FONT_BOLD_NAME = "KajovoMontserratSemibold"
FONT_DIR = Path(__file__).resolve().parents[2] / "assets" / "fonts"


def _register_font() -> None:
    if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT_DIR / "montserrat_regular.ttf")))
        pdfmetrics.registerFont(TTFont(FONT_BOLD_NAME, str(FONT_DIR / "montserrat_semibold.ttf")))


def render_table_pdf(
    *, title: str, date_label: str, headers: list[str], rows: list[list[str]],
    column_widths: list[int], empty_label: str,
) -> bytes:
    _register_font()
    output = BytesIO()
    document = SimpleDocTemplate(
        output, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=42, bottomMargin=42,
        title=title, author="Kájovo Hotel",
    )
    title_style = ParagraphStyle("title", fontName=FONT_BOLD_NAME, fontSize=15, leading=20, textColor=colors.HexColor("#202020"), alignment=TA_LEFT)
    meta_style = ParagraphStyle("meta", fontName=FONT_NAME, fontSize=9, leading=14, textColor=colors.HexColor("#555555"))
    cell_style = ParagraphStyle("cell", fontName=FONT_NAME, fontSize=8, leading=12, wordWrap="CJK")
    header_style = ParagraphStyle("header", parent=cell_style, fontName=FONT_BOLD_NAME, textColor=colors.white)

    def paragraph(value: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(escape(str(value)), style)

    table_rows = [[paragraph(value, header_style) for value in headers]]
    table_rows += [[paragraph(value, cell_style) for value in row] for row in rows]
    if not rows:
        table_rows.append([paragraph(empty_label, cell_style)] + ["" for _ in headers[1:]])
    table = LongTable(table_rows, colWidths=column_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#343a42")),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dddddd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        *(([("SPAN", (0, 1), (-1, 1))]) if not rows else []),
    ]))
    document.build([paragraph(title, title_style), Spacer(1, 8), paragraph(date_label, meta_style), Spacer(1, 16), table])
    return output.getvalue()
