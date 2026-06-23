"""
CSV and PDF export for the /api/data/export/* endpoints.

PDF uses reportlab for layout and matplotlib (Agg backend) for chart generation.
Both functions reuse get_aligned_data / get_chart_data so alignment logic is
never duplicated.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from schemas.data import DataQueryParams
from services.data import get_aligned_data, get_chart_data

PDF_MAX_ROWS = 500

_SERIES_COLORS = [
    "#38bdf8",
    "#22c55e",
    "#f59e0b",
    "#a78bfa",
    "#ef4444",
    "#14b8a6",
    "#e879f9",
    "#f97316",
]


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------


def export_data_csv(
    tenant: dict[str, Any],
    params: DataQueryParams,
    user_level: int,
    decimal_separator: str = "dot",
) -> str:
    """
    Returns the full aligned dataset as a CSV string.

    decimal_separator='dot'   → '.' decimal, ',' column delimiter  (international)
    decimal_separator='comma' → ',' decimal, ';' column delimiter  (European Excel)
    """
    data = get_aligned_data(tenant, params, user_level)
    columns: list[dict[str, Any]] = data["columns"]
    rows: list[dict[str, Any]] = data["rows"]

    use_comma_decimal = decimal_separator == "comma"
    col_delimiter = ";" if use_comma_decimal else ","

    output = io.StringIO()
    writer = csv.writer(output, delimiter=col_delimiter, quoting=csv.QUOTE_MINIMAL)

    header = ["Date", "Time"] + [
        f"{col['station_name']} - {col['sensor_name']}" for col in columns
    ]
    writer.writerow(header)

    for row in rows:
        time_cell = " / ".join(row["time_labels"])
        cells: list[str] = [row["date_label"], time_cell]
        for col in columns:
            v = row["values"].get(col["column_key"])
            if v is None:
                cells.append("")
            else:
                fmt = str(int(v)) if float(v).is_integer() else f"{v:.4f}"
                if use_comma_decimal:
                    fmt = fmt.replace(".", ",")
                cells.append(fmt)
        writer.writerow(cells)

    return output.getvalue()


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


def export_data_pdf(
    tenant: dict[str, Any],
    params: DataQueryParams,
    user_level: int,
    client_name: str = "",
) -> bytes:
    """
    Returns a PDF report as bytes.

    Includes: header banner, metadata summary, matplotlib chart, aligned data
    table (capped at PDF_MAX_ROWS with a note when truncated).

    Uses landscape A4 when there are more than 5 data columns.
    """
    data = get_aligned_data(tenant, params, user_level)
    chart_data = get_chart_data(tenant, params, user_level)
    columns: list[dict[str, Any]] = data["columns"]
    rows: list[dict[str, Any]] = data["rows"]
    series: list[dict[str, Any]] = chart_data["series"]

    use_landscape = len(columns) > 5
    page_size = landscape(A4) if use_landscape else A4
    page_w, _ = page_size
    margin = 1.5 * cm
    content_w = page_w - 2 * margin

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    # --- Styles ---------------------------------------------------------
    title_style = ParagraphStyle(
        "ZTitle",
        fontName="Helvetica-Bold",
        fontSize=15,
        textColor=colors.white,
        leading=18,
    )
    subtitle_style = ParagraphStyle(
        "ZSubtitle",
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.Color(0.56, 0.74, 0.97),
        leading=12,
    )
    section_style = ParagraphStyle(
        "ZSection",
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.Color(0.06, 0.09, 0.15),
        spaceBefore=6,
        spaceAfter=3,
    )
    meta_key_style = ParagraphStyle(
        "ZMetaKey",
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.Color(0.4, 0.5, 0.6),
    )
    meta_val_style = ParagraphStyle(
        "ZMetaVal",
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.Color(0.1, 0.2, 0.3),
    )
    th_style = ParagraphStyle(
        "ZTH",
        fontName="Helvetica-Bold",
        fontSize=7,
        textColor=colors.white,
        leading=9,
    )
    td_style = ParagraphStyle(
        "ZTD",
        fontName="Helvetica",
        fontSize=7,
        textColor=colors.Color(0.1, 0.15, 0.25),
        leading=9,
    )
    note_style = ParagraphStyle(
        "ZNote",
        fontName="Helvetica-Oblique",
        fontSize=7.5,
        textColor=colors.Color(0.5, 0.5, 0.5),
    )

    story: list[Any] = []

    # --- Header banner --------------------------------------------------
    banner = Table(
        [[
            Paragraph("Zetaced — Environmental Monitoring", title_style),
            Paragraph(client_name or "", subtitle_style),
        ]],
        colWidths=[content_w * 0.68, content_w * 0.32],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.Color(0.06, 0.11, 0.19)),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(banner)
    story.append(Spacer(1, 0.3 * cm))

    # --- Metadata -------------------------------------------------------
    date_from_str = params.date_from.strftime("%d/%m/%Y %H:%M") if params.date_from else "—"
    date_to_str = params.date_to.strftime("%d/%m/%Y %H:%M") if params.date_to else "—"
    truncated = len(rows) > PDF_MAX_ROWS
    display_rows = rows[:PDF_MAX_ROWS]
    rows_label = (
        f"{len(rows)} (showing first {PDF_MAX_ROWS})" if truncated else str(len(rows))
    )

    meta_data = [
        [Paragraph("Period", meta_key_style), Paragraph(f"{date_from_str} → {date_to_str}", meta_val_style)],
        [Paragraph("Alignment", meta_key_style), Paragraph(f"{params.alignment_seconds} s", meta_val_style)],
        [Paragraph("Rows", meta_key_style), Paragraph(rows_label, meta_val_style)],
        [Paragraph("Columns", meta_key_style), Paragraph(str(len(columns)), meta_val_style)],
        [Paragraph("Generated", meta_key_style), Paragraph(datetime.now().strftime("%d/%m/%Y %H:%M:%S"), meta_val_style)],
    ]
    meta_table = Table(meta_data, colWidths=[2.8 * cm, content_w - 2.8 * cm])
    meta_table.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.4 * cm))

    # --- Chart ----------------------------------------------------------
    chart_png = _generate_chart_png(series)
    if chart_png:
        story.append(Paragraph("Chart", section_style))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.Color(0.8, 0.87, 0.94)))
        story.append(Spacer(1, 0.2 * cm))
        chart_img = Image(io.BytesIO(chart_png), width=content_w, height=5.5 * cm)
        story.append(chart_img)
        story.append(Spacer(1, 0.4 * cm))

    # --- Data table -----------------------------------------------------
    story.append(Paragraph("Aligned Data", section_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.Color(0.8, 0.87, 0.94)))
    story.append(Spacer(1, 0.2 * cm))

    if display_rows:
        col_count = len(columns)
        date_col_w = 1.9 * cm
        time_col_w = 2.1 * cm
        remaining = content_w - date_col_w - time_col_w
        data_col_w = max(1.6 * cm, remaining / max(col_count, 1))
        col_widths = [date_col_w, time_col_w] + [data_col_w] * col_count

        table_header_row = [
            Paragraph("<b>Date</b>", th_style),
            Paragraph("<b>Time</b>", th_style),
        ] + [
            Paragraph(
                f"<b>{col['station_name']}</b><br/>{col['sensor_name']}",
                th_style,
            )
            for col in columns
        ]
        table_data = [table_header_row]

        for row in display_rows:
            time_cell = "<br/>".join(row["time_labels"])
            row_cells = [
                Paragraph(row["date_label"], td_style),
                Paragraph(time_cell, td_style),
            ]
            for col in columns:
                v = row["values"].get(col["column_key"])
                if v is None:
                    row_cells.append(Paragraph("", td_style))
                else:
                    fmt = str(int(v)) if float(v).is_integer() else f"{v:.2f}"
                    row_cells.append(Paragraph(fmt, td_style))
            table_data.append(row_cells)

        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.06, 0.11, 0.19)),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(0.94, 0.97, 1.0)]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.Color(0.82, 0.88, 0.95)),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tbl)

        if truncated:
            story.append(Spacer(1, 0.3 * cm))
            story.append(Paragraph(
                f"Note: the table shows the first {PDF_MAX_ROWS} of {len(rows)} rows. "
                "Use CSV export to download the complete dataset.",
                note_style,
            ))
    else:
        story.append(Paragraph(
            "No data available for the selected filters.",
            note_style,
        ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _generate_chart_png(series: list[dict[str, Any]]) -> bytes | None:
    active = [s for s in series if s.get("points")]
    if not active:
        return None

    fig, ax = plt.subplots(figsize=(14, 4))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("#f8fafc")
    ax.grid(True, color="#e2e8f0", linewidth=0.7, linestyle="--", zorder=0)

    for idx, s in enumerate(active):
        color = _hex_to_rgb(_SERIES_COLORS[idx % len(_SERIES_COLORS)])
        timestamps: list[datetime] = []
        values: list[float] = []
        for p in s["points"]:
            ts = p["timestamp"]
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts)
                except ValueError:
                    continue
            timestamps.append(ts)
            values.append(float(p["value"]))

        if not timestamps:
            continue

        label = f"{s['station_name']} — {s['sensor_name']}"
        ax.plot(timestamps, values, color=color, linewidth=1.4, label=label, zorder=2)

    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m %H:%M"))
    fig.autofmt_xdate(rotation=30, ha="right")
    ax.tick_params(labelsize=7)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    if active:
        ax.legend(
            loc="upper right",
            fontsize=6.5,
            framealpha=0.9,
            frameon=True,
            edgecolor="#e2e8f0",
        )

    plt.tight_layout(pad=0.5)
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)
