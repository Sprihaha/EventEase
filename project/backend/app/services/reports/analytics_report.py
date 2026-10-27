"""EaseAnalytics export: a presentable PDF (charts + tables) and an Excel workbook (native charts)."""
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, Spacer

from app.services.reports import common as c

CONTENT_WIDTH = A4[0] - 30 * mm
NOTE = ("Figures count CONFIRMED bookings only. Amounts are in Singapore dollars (SGD). Daily totals use "
        "Singapore time (UTC+8). This is a read-only snapshot taken from EventEase at the time shown.")


def _tier_name(tier) -> str:
    return c.pretty(tier["type"])


def _short(label: str, limit: int = 14) -> str:
    return label if len(label) <= limit else label[: limit - 1] + "…"


def build_pdf(*, organiser: str, scope: str, days: int, sales: dict, velocity: dict, tiers: dict,
              generated: datetime) -> bytes:
    st = c.styles()
    buffer = BytesIO()
    doc = c.new_doc(buffer, "EventEase sales and revenue report")
    half = CONTENT_WIDTH / 2 - 8
    story = [
        Paragraph("Sales &amp; Revenue Report", st["title"]),
        Paragraph(f"Organiser: {c.esc(organiser)} &nbsp;|&nbsp; Scope: {c.esc(scope)} &nbsp;|&nbsp; Trend period: last {days} days "
                  f"&nbsp;|&nbsp; Generated {c.fmt_dt(generated)} SGT", st["sub"]),
        c.kpi_row([
            ("Confirmed bookings", c.fmt_int(sales["confirmed_bookings"])),
            ("Tickets sold", c.fmt_int(sales["total_tickets_sold"])),
            ("Total revenue", c.fmt_money(sales["total_revenue_cents"])),
            (f"Revenue, last {days} days", c.fmt_money(velocity["total_revenue_cents"])),
        ], CONTENT_WIDTH),
        Spacer(1, 4),
        Paragraph(f"Average per day over the last {days} days: {c.fmt_money(velocity['average_daily_revenue_cents'])}",
                  st["note"]),
        Paragraph("Revenue and ticket demand", st["h2"]),
    ]

    events = sales["events"]
    tier_rows = tiers["tiers"]
    story.append(c.two_up(
        c.chart_title(c.bar_chart([_short(e["title"]) for e in events],
                                  [e["revenue_cents"] / 100 for e in events],
                                  width=half, colour=c.PALETTE[0], money=True), "Revenue per event (SGD)"),
        c.chart_title(c.pie_chart([_tier_name(t) for t in tier_rows], [t["tickets_sold"] for t in tier_rows],
                                  width=half), "Tickets sold by tier"),
        CONTENT_WIDTH))

    labels = [p["day"].strftime("%d %b") for p in velocity["points"]]
    story.append(Paragraph(f"Revenue trend, last {days} days", st["h2"]))
    story.append(c.two_up(
        c.chart_title(c.bar_chart(labels, [p["revenue_cents"] / 100 for p in velocity["points"]], width=half,
                                  colour=c.PALETTE[2], money=True), "Daily revenue (SGD)"),
        c.chart_title(c.line_chart(labels, [p["cumulative_revenue_cents"] / 100 for p in velocity["points"]],
                                   width=half, colour=c.PALETTE[4]), "Running total (SGD)"),
        CONTENT_WIDTH))

    # Tables carry the exact figures behind the charts, so an auditor can check them.
    sales_rows = [["Event", "Confirmed bookings", "Tickets sold", "Revenue (SGD)"]]
    for e in events:
        sales_rows.append([Paragraph(c.esc(e["title"]), st["cell"]), c.fmt_int(e["confirmed_bookings"]),
                           c.fmt_int(e["tickets_sold"]), f"{e['revenue_cents'] / 100:,.2f}"])
    sales_rows.append(["Total", c.fmt_int(sales["confirmed_bookings"]), c.fmt_int(sales["total_tickets_sold"]),
                       f"{sales['total_revenue_cents'] / 100:,.2f}"])
    if not events:
        sales_rows.insert(1, ["No events yet", "0", "0", "0.00"])
    tier_table = [["Ticket tier", "Tickets sold", "Share", "Revenue (SGD)"]]
    for t in tier_rows:
        tier_table.append([_tier_name(t), c.fmt_int(t["tickets_sold"]), f"{t['share_percent']:.1f}%",
                           f"{t['revenue_cents'] / 100:,.2f}"])

    story.append(KeepTogether([
        Paragraph("Sales per event", st["h2"]),
        c.data_table(sales_rows, [CONTENT_WIDTH * 0.46, CONTENT_WIDTH * 0.18, CONTENT_WIDTH * 0.16,
                                  CONTENT_WIDTH * 0.20], align_right={1, 2, 3}, bold_last=True),
    ]))
    story.append(KeepTogether([
        Paragraph("Ticket tier demand", st["h2"]),
        c.data_table(tier_table, [CONTENT_WIDTH * 0.40, CONTENT_WIDTH * 0.20, CONTENT_WIDTH * 0.15,
                                  CONTENT_WIDTH * 0.25], align_right={1, 2, 3}),
    ]))
    story.append(Spacer(1, 8))
    story.append(Paragraph(NOTE, st["note"]))

    footer = c.page_furniture("Sales & Revenue Report", generated)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


# --------------------------------------------------------------------------- Excel

HEADER_FILL = PatternFill("solid", start_color="1E3A8A")
HEADER_FONT = Font(bold=True, color="FFFFFF")
MONEY = '#,##0.00'


def _header(ws, row: int, names: list[str]) -> None:
    for col, name in enumerate(names, start=1):
        cell = ws.cell(row=row, column=col, value=name)
        cell.fill, cell.font = HEADER_FILL, HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _widths(ws, widths: list[int]) -> None:
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def build_xlsx(*, organiser: str, scope: str, days: int, sales: dict, velocity: dict, tiers: dict,
               generated: datetime) -> bytes:
    wb = Workbook()

    # ---- Summary
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "EventEase - Sales & Revenue Report"
    ws["A1"].font = Font(bold=True, size=16)
    c.put_text(ws, 2, 1, f"Organiser: {organiser}")
    c.put_text(ws, 3, 1, f"Scope: {scope}")
    ws["A4"] = f"Trend period: last {days} days (Singapore time)"
    ws["A5"] = f"Generated: {c.fmt_dt(generated)} SGT"
    _header(ws, 7, ["Measure", "Value"])
    kpis = [
        ("Confirmed bookings", sales["confirmed_bookings"], "#,##0"),
        ("Tickets sold", sales["total_tickets_sold"], "#,##0"),
        ("Total revenue (SGD)", sales["total_revenue_cents"] / 100, MONEY),
        (f"Revenue, last {days} days (SGD)", velocity["total_revenue_cents"] / 100, MONEY),
        ("Average daily revenue in period (SGD)", velocity["average_daily_revenue_cents"] / 100, MONEY),
    ]
    for i, (label, value, fmt) in enumerate(kpis, start=8):
        ws.cell(row=i, column=1, value=label)
        cell = ws.cell(row=i, column=2, value=value)
        cell.number_format = fmt
    ws["A14"] = NOTE
    ws["A14"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A14:F16")
    _widths(ws, [42, 20, 14, 14, 14, 14])

    # ---- Sales per event
    ws = wb.create_sheet("Sales per event")
    _header(ws, 1, ["Event", "Confirmed bookings", "Tickets sold", "Revenue (SGD)"])
    events = sales["events"]
    for i, e in enumerate(events, start=2):
        c.put_text(ws, i, 1, e["title"])
        ws.cell(row=i, column=2, value=e["confirmed_bookings"])
        ws.cell(row=i, column=3, value=e["tickets_sold"])
        ws.cell(row=i, column=4, value=e["revenue_cents"] / 100).number_format = MONEY
    total_row = len(events) + 2
    ws.cell(row=total_row, column=1, value="Total").font = Font(bold=True)
    ws.cell(row=total_row, column=2, value=sales["confirmed_bookings"]).font = Font(bold=True)
    ws.cell(row=total_row, column=3, value=sales["total_tickets_sold"]).font = Font(bold=True)
    total_cell = ws.cell(row=total_row, column=4, value=sales["total_revenue_cents"] / 100)
    total_cell.number_format, total_cell.font = MONEY, Font(bold=True)
    ws.freeze_panes = "A2"
    _widths(ws, [40, 20, 14, 18])
    if events:
        chart = BarChart()
        chart.type, chart.title = "col", "Revenue per event (SGD)"
        chart.y_axis.title, chart.legend = "SGD", None
        chart.add_data(Reference(ws, min_col=4, min_row=1, max_row=len(events) + 1), titles_from_data=True)
        chart.set_categories(Reference(ws, min_col=1, min_row=2, max_row=len(events) + 1))
        chart.height, chart.width = 8, 16
        ws.add_chart(chart, "F2")

    # ---- Revenue velocity
    ws = wb.create_sheet("Revenue trend")
    _header(ws, 1, ["Day", "Tickets sold", "Revenue (SGD)", "Running total (SGD)"])
    points = velocity["points"]
    for i, p in enumerate(points, start=2):
        ws.cell(row=i, column=1, value=p["day"]).number_format = "dd mmm yyyy"
        ws.cell(row=i, column=2, value=p["tickets_sold"])
        ws.cell(row=i, column=3, value=p["revenue_cents"] / 100).number_format = MONEY
        ws.cell(row=i, column=4, value=p["cumulative_revenue_cents"] / 100).number_format = MONEY
    ws.freeze_panes = "A2"
    _widths(ws, [16, 14, 16, 20])
    if points:
        last = len(points) + 1
        bars = BarChart()
        bars.type, bars.title = "col", f"Daily revenue, last {days} days (SGD)"
        bars.legend = None
        bars.add_data(Reference(ws, min_col=3, min_row=1, max_row=last), titles_from_data=True)
        bars.set_categories(Reference(ws, min_col=1, min_row=2, max_row=last))
        bars.height, bars.width = 8, 18
        ws.add_chart(bars, "F2")
        line = LineChart()
        line.title, line.legend = "Running total (SGD)", None
        line.add_data(Reference(ws, min_col=4, min_row=1, max_row=last), titles_from_data=True)
        line.set_categories(Reference(ws, min_col=1, min_row=2, max_row=last))
        line.height, line.width = 8, 18
        ws.add_chart(line, "F19")

    # ---- Tier demand
    ws = wb.create_sheet("Tier demand")
    _header(ws, 1, ["Ticket tier", "Tickets sold", "Share (%)", "Revenue (SGD)"])
    tier_rows = tiers["tiers"]
    for i, t in enumerate(tier_rows, start=2):
        ws.cell(row=i, column=1, value=_tier_name(t))
        ws.cell(row=i, column=2, value=t["tickets_sold"])
        ws.cell(row=i, column=3, value=t["share_percent"]).number_format = "0.0"
        ws.cell(row=i, column=4, value=t["revenue_cents"] / 100).number_format = MONEY
    ws.freeze_panes = "A2"
    _widths(ws, [20, 14, 12, 18])
    if any(t["tickets_sold"] for t in tier_rows):
        pie = PieChart()
        pie.title = "Tickets sold by tier"
        pie.add_data(Reference(ws, min_col=2, min_row=1, max_row=len(tier_rows) + 1), titles_from_data=True)
        pie.set_categories(Reference(ws, min_col=1, min_row=2, max_row=len(tier_rows) + 1))
        pie.dataLabels = DataLabelList()
        pie.dataLabels.showPercent = True
        pie.dataLabels.showVal = pie.dataLabels.showCatName = pie.dataLabels.showSerName = False
        pie.dataLabels.showLegendKey = False
        pie.height, pie.width = 8, 12
        ws.add_chart(pie, "F2")

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
