#!/usr/bin/env python3
"""
Synchronize Blackstone Ward Tithing Declaration Schedule from Excel (.xlsx)
to public/data/tithing-declaration.json and public/td/index.html.

Rules:
- Explicitly skips the 'Summary' tab (never sources Summary).
- Sources the Sunday interview tabs (November through first Sunday in December,
  or any Sunday tab with scheduled households).
- Preserves all time slots (2:05 PM - 4:05 PM), household names, and members included.
"""

import datetime
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

DEFAULT_XLSX_PATH = (
    "/Users/dharris/Documents/0Church/Blackstone_Ward/Bishopric/"
    "Tithing_Declaration/2026/Blackstone-Tithing-Declaration-Schedule-2026.xlsx"
)

STANDARD_TIME_SLOTS = [
    "2:05–2:15 PM",
    "2:15–2:25 PM",
    "2:25–2:35 PM",
    "2:35–2:45 PM",
    "2:45–2:55 PM",
    "2:55–3:05 PM",
    "3:05–3:15 PM",
    "3:15–3:25 PM",
    "3:25–3:35 PM",
    "3:35–3:45 PM",
    "3:45–3:55 PM",
    "3:55–4:05 PM",
]


def col_letter(cell_ref: str) -> str:
    m = re.match(r"^([A-Z]+)", cell_ref or "")
    return m.group(1) if m else ""


def parse_sheet_date(sheet_name: str) -> str:
    """Parse 'November 1, 2026' -> '2026-11-01'."""
    cleaned = re.sub(r"^Sunday,\s*", "", sheet_name.strip(), flags=re.IGNORECASE)
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y-%m-%d"):
        try:
            dt = datetime.datetime.strptime(cleaned, fmt).date()
            return dt.isoformat()
        except ValueError:
            continue
    return ""


def parse_xlsx(xlsx_path: str) -> dict:
    if not os.path.exists(xlsx_path):
        raise FileNotFoundError(f"Excel file not found: {xlsx_path}")

    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }

    with zipfile.ZipFile(xlsx_path, "r") as z:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rels}

        shared_strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            sst = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in sst.findall("main:si", ns):
                text = "".join(t.text or "" for t in si.findall(".//main:t", ns))
                shared_strings.append(text)

        sundays = []

        for sheet in wb.findall(".//main:sheet", ns):
            sheet_name = (sheet.attrib.get("name") or "").strip()
            # Rule: NEVER source the Summary tab
            if sheet_name.lower() == "summary":
                continue

            rid = sheet.attrib.get(
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            )
            if not rid or rid not in rel_map:
                continue

            target = "xl/" + rel_map[rid].lstrip("/")
            if target not in z.namelist():
                continue

            sxml = ET.fromstring(z.read(target))
            rows_data = {}

            for row in sxml.findall(".//main:row", ns):
                r_num = int(row.attrib.get("r", "0"))
                row_cells = {}
                for c in row.findall("main:c", ns):
                    ref = c.attrib.get("r", "")
                    col = col_letter(ref)
                    c_type = c.attrib.get("t", "")
                    v_el = c.find("main:v", ns)
                    is_el = c.find("main:is", ns)
                    val = ""
                    if c_type == "s" and v_el is not None and v_el.text is not None:
                        idx = int(v_el.text)
                        if 0 <= idx < len(shared_strings):
                            val = shared_strings[idx]
                    elif c_type == "inlineStr" and is_el is not None:
                        val = "".join(
                            x.text or "" for x in is_el.findall(".//main:t", ns)
                        )
                    elif v_el is not None and v_el.text is not None:
                        val = v_el.text
                    row_cells[col] = val.strip()
                rows_data[r_num] = row_cells

            subtitle = rows_data.get(2, {}).get("A", f"Sunday, {sheet_name}")
            iso_date = parse_sheet_date(sheet_name) or parse_sheet_date(subtitle)

            slots = []
            seen_times = set()
            for r_num in sorted(rows_data.keys()):
                if r_num < 4:
                    continue
                cells = rows_data[r_num]
                time_label = cells.get("A", "").strip()
                household = cells.get("B", "").strip()
                members = cells.get("C", "").strip()
                if not time_label and not household and not members:
                    continue
                seen_times.add(time_label)
                slots.append(
                    {
                        "slotIndex": len(slots) + 1,
                        "time": time_label,
                        "household": household,
                        "members": members,
                        "available": not bool(household),
                    }
                )

            # Fill any remaining standard 10-minute slots up to 3:55–4:05 PM if partial sheet
            for std_time in STANDARD_TIME_SLOTS:
                if std_time not in seen_times:
                    slots.append(
                        {
                            "slotIndex": len(slots) + 1,
                            "time": std_time,
                            "household": "",
                            "members": "",
                            "available": True,
                        }
                    )

            scheduled_count = sum(1 for s in slots if not s["available"])
            # Only include Sunday tabs from November/December or tabs that have scheduled households
            if scheduled_count == 0 and not (
                iso_date.startswith("2026-11") or iso_date.startswith("2026-12")
            ):
                continue

            sundays.append(
                {
                    "tabName": sheet_name,
                    "title": subtitle if subtitle else f"Sunday, {sheet_name}",
                    "date": iso_date,
                    "scheduledCount": scheduled_count,
                    "totalSlots": len(slots),
                    "openCount": len(slots) - scheduled_count,
                    "slots": slots,
                }
            )

    total_scheduled = sum(d["scheduledCount"] for d in sundays)
    total_open = sum(d["openCount"] for d in sundays)

    return {
        "title": "Blackstone Ward Tithing Declaration",
        "subtitle": "Sunday Interview Schedule — November through December 6, 2026",
        "updatedAt": datetime.date.today().isoformat(),
        "contacts": {
            "toEmail": "mcdonaldlds830@gmail.com",
            "ccEmail": "duanepharris@gmail.com",
        },
        "totalScheduled": total_scheduled,
        "totalOpenSlots": total_open,
        "sundays": sundays,
    }


def main():
    xlsx_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX_PATH
    repo_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
    )
    json_out = os.path.join(repo_root, "public", "data", "tithing-declaration.json")
    html_out = os.path.join(repo_root, "public", "td", "index.html")

    data = parse_xlsx(xlsx_path)

    os.makedirs(os.path.dirname(json_out), exist_ok=True)
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(
        f"Synced {len(data['sundays'])} Sunday tabs "
        f"({data['totalScheduled']} scheduled households, {data['totalOpenSlots']} open slots) "
        f"-> {json_out}"
    )

    # If public/td/index.html exists and has embedded schedule JSON markers, update it too
    if os.path.exists(html_out):
        with open(html_out, "r", encoding="utf-8") as f:
            html_content = f.read()
        pattern = re.compile(
            r"(<!-- TD_DATA_START -->\s*<script id=\"td-schedule-data\" type=\"application/json\">\s*)"
            r".*?"
            r"(\s*</script>\s*<!-- TD_DATA_END -->)",
            re.DOTALL,
        )
        if pattern.search(html_content):
            inline_json = json.dumps(data, indent=2, ensure_ascii=False)
            updated_html = pattern.sub(
                lambda m: m.group(1) + inline_json + m.group(2), html_content
            )
            with open(html_out, "w", encoding="utf-8") as f:
                f.write(updated_html)
            print(f"Updated embedded schedule data in {html_out}")


if __name__ == "__main__":
    main()

