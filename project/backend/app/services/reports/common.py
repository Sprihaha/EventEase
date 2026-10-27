"""Shared helpers for the PDF reports: formatting, palette, reportlab chart builders and page furniture."""
from datetime import datetime, timedelta, timezone
from io import BytesIO
from xml.sax.saxutils import escape as _xml_escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, Line, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

SGT = timezone(timedelta(hours=8))  # Singapore: UTC+8, no daylight saving
BRAND = "EventEase"

INK = colors.HexColor("#1F2937")
MUTED = colors.HexColor("#6B7280")
GRID = colors.HexColor("#E5E7EB")
HEADER_BG = colors.HexColor("#1E3A8A")
ZEBRA = colors.HexColor("#F3F4F6")

# Distinct, colour-blind-friendly series colours (also differ in lightness so greyscale prints still work).
PALETTE = [
    colors.HexColor("#2563EB"),  # blue
    colors.HexColor("#F59E0B"),  # amber
    colors.HexColor("#10B981"),  # green
    colors.HexColor("#DC2626"),  # red
    colors.HexColor("#7C3AED"),  # violet
    colors.HexColor("#6B7280"),  # grey
]

STATUS_COLOURS = {
    "SUBMITTED": colors.HexColor("#6B7280"),
    "ASSIGNED": colors.HexColor("#2563EB"),
    "IN_PROGRESS": colors.HexColor("#F59E0B"),
    "COMPLETED": colors.HexColor("#10B981"),
    "CANCELLED": colors.HexColor("#DC2626"),
}


def esc(value) -> str:
    """Escape user-supplied text before it goes into a reportlab Paragraph (which parses mini-HTML)."""
    return _xml_escape("" if value is None else str(value))


def put_text(ws, row: int, column: int, value):
    """Write user-supplied text into an Excel cell as plain text, never as a formula (e.g. '=1+1' or '@SUM')."""
    cell = ws.cell(row=row, column=column, value=value)
    if isinstance(value, str):
        cell.data_type = "s"
    return cell


def enum_value(value) -> str:
    return str(getattr(value, "value", value))


def to_sgt(moment: datetime | None) -> datetime | None:
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(SGT)


def fmt_dt(moment: datetime | None) -> str:
    local = to_sgt(moment)
    return local.strftime("%d %b %Y %H:%M") if local else "-"


def fmt_money(cents: int | float) -> str:
    return f"SGD {cents / 100:,.2f}"


def fmt_int(value: int | float) -> str:
    return f"{int(value):,}"


def pretty(value) -> str:
    """IN_PROGRESS -> In progress."""
    return enum_value(value).replace("_", " ").capitalize()


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24,
                                textColor=INK, alignment=0, spaceAfter=2),
        "sub": ParagraphStyle("s", parent=base["Normal"], fontSize=9, leading=12, textColor=MUTED, spaceAfter=10),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16,
                             textColor=INK, spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("b", parent=base["Normal"], fontSize=9, leading=12, textColor=INK),
        "note": ParagraphStyle("n", parent=base["Normal"], fontSize=8, leading=10, textColor=MUTED),
        "cell": ParagraphStyle("c", parent=base["Normal"], fontSize=8, leading=10, textColor=INK),
    }


def new_doc(buffer: BytesIO, title: str, *, wide: bool = False) -> SimpleDocTemplate:
    size = landscape(A4) if wide else A4
    return SimpleDocTemplate(buffer, pagesize=size, leftMargin=15 * mm, rightMargin=15 * mm,
                             topMargin=15 * mm, bottomMargin=16 * mm, title=title, author=BRAND)


def page_furniture(label: str, generated: datetime):
    """Footer with the report name, generation time and page number on every page."""
    stamp = generated.astimezone(SGT).strftime("%d %b %Y %H:%M SGT")

    def draw(canvas, doc):
        canvas.saveState()
        width, _ = doc.pagesize
        canvas.setStrokeColor(GRID)
        canvas.line(doc.leftMargin, 12 * mm, width - doc.rightMargin, 12 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, 8 * mm, f"{BRAND} - {label} - generated {stamp}")
        canvas.drawRightString(width - doc.rightMargin, 8 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def data_table(rows: list[list], col_widths: list[float], *, align_right: set[int] | None = None,
               header_rows: int = 1, bold_last: bool = False) -> Table:
    table = Table(rows, colWidths=col_widths, repeatRows=header_rows)
    style = [
        ("BACKGROUND", (0, 0), (-1, header_rows - 1), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, header_rows - 1), colors.white),
        ("FONTNAME", (0, 0), (-1, header_rows - 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, header_rows), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, GRID),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, header_rows), (-1, -1), [colors.white, ZEBRA]),
    ]
    for col in align_right or set():
        style.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
    if bold_last:
        style += [("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("LINEABOVE", (0, -1), (-1, -1), 0.75, INK)]
    table.setStyle(TableStyle(style))
    return table


def kpi_row(items: list[tuple[str, str]], width: float) -> Table:
    """A row of big-number tiles: [(label, value), ...]."""
    cells = [[value for _, value in items], [label for label, _ in items]]
    table = Table(cells, colWidths=[width / len(items)] * len(items))
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 15),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica"), ("FONTSIZE", (0, 1), (-1, 1), 8),
        ("TEXTCOLOR", (0, 1), (-1, 1), MUTED),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), ZEBRA),
        ("BOX", (0, 0), (-1, -1), 0.5, GRID), ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
        ("TOPPADDING", (0, 0), (-1, 0), 9), ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
    ]))
    return table


# --------------------------------------------------------------------------- charts

def _empty_chart(width: float, height: float, message: str = "No data for this selection") -> Drawing:
    drawing = Drawing(width, height)
    drawing.add(String(width / 2, height / 2, message, textAnchor="middle", fontSize=9, fillColor=MUTED))
    return drawing


def _nice_max(value: float) -> float:
    if value <= 0:
        return 1
    magnitude = 10 ** (len(str(int(value))) - 1)
    for step in (1, 2, 2.5, 5, 10):
        if value <= step * magnitude:
            return step * magnitude
    return 10 * magnitude


def bar_chart(labels: list[str], values: list[float], *, width: float = 250, height: float = 170,
              colour=None, money: bool = False, bar_colours: list | None = None,
              max_labels: int = 12) -> Drawing:
    """Vertical bars. `values` are plotted as given (pass dollars for money charts)."""
    if not labels or not any(values):
        return _empty_chart(width, height)
    drawing = Drawing(width, height)
    chart = VerticalBarChart()
    chart.x, chart.y, chart.width, chart.height = 42, 28, width - 56, height - 46
    chart.data = [list(values)]
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = _nice_max(max(values))
    chart.valueAxis.valueStep = chart.valueAxis.valueMax / 4
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labelTextFormat = (lambda v: f"{v:,.0f}") if money or max(values) >= 10 else "%g"
    chart.valueAxis.gridStrokeColor = GRID
    chart.valueAxis.visibleGrid = True
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.boxAnchor = "ne" if len(labels) > 6 else "n"
    chart.categoryAxis.labels.angle = 35 if len(labels) > 6 else 0
    chart.categoryAxis.labels.dy = -2
    step = max(1, -(-len(labels) // max_labels))
    chart.categoryAxis.categoryNames = [label if i % step == 0 else "" for i, label in enumerate(labels)]
    chart.bars[0].fillColor = colour or PALETTE[0]
    chart.bars[0].strokeColor = None
    chart.barWidth = max(2, min(22, chart.width / (len(labels) * 1.6)))
    if bar_colours:
        for i, c in enumerate(bar_colours):
            chart.bars[(0, i)].fillColor = c
    drawing.add(chart)
    return drawing


def line_chart(labels: list[str], values: list[float], *, width: float = 250, height: float = 170,
               colour=None, max_labels: int = 8) -> Drawing:
    if not labels or not any(values):
        return _empty_chart(width, height)
    drawing = Drawing(width, height)
    plot = LinePlot()
    plot.x, plot.y, plot.width, plot.height = 46, 28, width - 60, height - 46
    plot.data = [[(i, v) for i, v in enumerate(values)]]
    plot.lines[0].strokeColor = colour or PALETTE[0]
    plot.lines[0].strokeWidth = 1.8
    plot.xValueAxis.valueMin, plot.xValueAxis.valueMax = 0, max(1, len(values) - 1)
    step = max(1, -(-len(labels) // max_labels))
    ticks = list(range(0, len(labels), step))
    plot.xValueAxis.valueSteps = ticks
    plot.xValueAxis.labelTextFormat = lambda v: labels[int(round(v))] if 0 <= int(round(v)) < len(labels) else ""
    plot.xValueAxis.labels.fontSize = 7
    plot.xValueAxis.labels.fontName = plot.yValueAxis.labels.fontName = "Helvetica"
    plot.yValueAxis.valueMin = 0
    plot.yValueAxis.valueMax = _nice_max(max(values))
    plot.yValueAxis.valueStep = plot.yValueAxis.valueMax / 4
    plot.yValueAxis.labels.fontSize = 7
    plot.yValueAxis.labelTextFormat = lambda v: f"{v:,.0f}"
    plot.yValueAxis.visibleGrid = True
    plot.yValueAxis.gridStrokeColor = GRID
    drawing.add(plot)
    return drawing


def pie_chart(labels: list[str], values: list[float], *, width: float = 250, height: float = 170,
              slice_colours: list | None = None) -> Drawing:
    pairs = [(name, v) for name, v in zip(labels, values, strict=False) if v > 0]
    if not pairs:
        return _empty_chart(width, height)
    drawing = Drawing(width, height)
    pie = Pie()
    size = min(height - 24, width * 0.5)
    pie.x, pie.y, pie.width, pie.height = 8, (height - size) / 2, size, size
    pie.data = [v for _, v in pairs]
    pie.labels = None
    pie.slices.strokeColor = colors.white
    pie.slices.strokeWidth = 1
    palette = slice_colours or PALETTE
    total = sum(pie.data)
    chosen = []
    for i, (label, value) in enumerate(pairs):
        colour = palette[i % len(palette)]
        pie.slices[i].fillColor = colour
        chosen.append((colour, f"{label}  {value:,.0f} ({100 * value / total:.0f}%)"))
    drawing.add(pie)
    legend = Legend()
    legend.x, legend.y = size + 22, height / 2 + 8 * len(chosen) / 2
    legend.alignment = "right"
    legend.fontSize = 8
    legend.fontName = "Helvetica"
    legend.dxTextSpace = 5
    legend.boxAnchor = "w"
    legend.columnMaximum = 8
    legend.colorNamePairs = chosen
    drawing.add(legend)
    return drawing


def chart_title(drawing: Drawing, text: str) -> Drawing:
    """Wrap a chart in a titled drawing so charts sit in a two-up grid with consistent captions."""
    wrapper = Drawing(drawing.width, drawing.height + 16)
    wrapper.add(String(0, drawing.height + 4, text, fontName="Helvetica-Bold", fontSize=9, fillColor=INK))
    wrapper.add(Line(0, drawing.height, drawing.width, drawing.height, strokeColor=GRID, strokeWidth=0.5))
    for shape in drawing.contents:
        wrapper.add(shape)
    return wrapper


def two_up(left: Drawing, right: Drawing, total_width: float) -> Table:
    table = Table([[left, right]], colWidths=[total_width / 2, total_width / 2])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    return table
