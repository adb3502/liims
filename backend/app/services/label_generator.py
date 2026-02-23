"""
Label generator for BHARAT Study participants.

Generates A4-formatted Word documents with participant labels across 5 groups:
  - Cryovial (P1-P5): 5 per row, 17 rows/page, with row gutters
  - Epigenetics (E1-E4): 4 per row, 21 rows/page
  - Samples (CS1, R1, H1, +H2 for B-participants): 4 per row
  - EDTA (EDTA1-EDTA4): 4 per row
  - SST/Fl/Blood (SST1, SST2, Fl1, B1): 4 per row

Adapted from the original standalone label_generator.py script.
Will transition to thermal printing in the future.
"""

import io
import re
import zipfile
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt

# 22 labels per participant, grouped by document type
LABEL_GROUPS = {
    "cryovial": ["P1", "P2", "P3", "P4", "P5"],
    "epigenetics": ["E1", "E2", "E3", "E4"],
    "samples": ["CS1", "R1", "H1", ""],  # blank slot becomes H2 for B-participants
    "edta": ["EDTA1", "EDTA2", "EDTA3", "EDTA4"],
    "sst_fl_blood": ["SST1", "SST2", "Fl1", "B1"],
    "urine": ["U1"],
}

# Cryovial layout: 5 labels per row with row gutters
CRYO_CONFIG = {
    "rows_per_page": 17,
    "row_h_cm": 1.3,
    "row_gutter_h_cm": 0.3,
    "col_widths_cm": [3.3, 0.3, 3.3, 0.3, 3.3, 0.3, 3.3, 0.3, 3.3],
    "label_col_idx": [0, 2, 4, 6, 8],
    "margins_cm": {"top": 0.5, "bottom": 0.5, "left": 0.5, "right": 0.5},
    "font": "Aptos",
    "font_size": 11,
    "font_size_header": 7,
    "has_row_gutters": True,
}

# Normal layout: 4 labels per row, no gutters
NORMAL_CONFIG = {
    "rows_per_page": 21,
    "row_h_cm": 1.25,
    "row_gutter_h_cm": 0,
    "col_widths_cm": [4.6, 0.5, 4.6, 0.5, 4.6, 0.5, 4.6],
    "label_col_idx": [0, 2, 4, 6],
    "margins_cm": {"top": 1.8, "bottom": 0.5, "left": 0.5, "right": 0.5},
    "font": "Aptos",
    "font_size": 11,
    "font_size_header": 7,
    "has_row_gutters": False,
}

A4_W_CM = 21.0
A4_H_CM = 29.7


def _cm_to_twips(cm: float) -> int:
    return int(cm * 567)


def _is_b_participant(participant: str) -> bool:
    """Check if participant code has 'B' (e.g., 1B-123, 2B-456)."""
    return bool(re.match(r"^\d+B-", participant))


def _create_label_collections(
    participants: list[str],
) -> dict[str, list[str]]:
    """Create collections of labels grouped by document type."""
    collections: dict[str, list[str]] = {k: [] for k in LABEL_GROUPS}

    for participant in participants:
        for group_name, suffixes in LABEL_GROUPS.items():
            for suffix in suffixes:
                if suffix:
                    collections[group_name].append(f"{participant}-{suffix}")
                elif _is_b_participant(participant):
                    collections[group_name].append(f"{participant}-H2")
                else:
                    collections[group_name].append("")

    return collections


def _set_table_xml_enforced(table, col_widths_cm: list[float]) -> None:
    """Add fixed layout + zero spacing + explicit widths at XML level."""
    tbl = table._tbl
    tblPr = tbl.tblPr

    # Fixed layout
    try:
        layout_xml = parse_xml(
            r'<w:tblLayout %s w:type="fixed"/>' % nsdecls("w")
        )
        tblPr.append(layout_xml)
    except Exception:
        pass

    # Zero cell spacing
    try:
        spacing_xml = parse_xml(
            r'<w:tblCellSpacing %s w:w="0" w:type="dxa"/>' % nsdecls("w")
        )
        tblPr.append(spacing_xml)
    except Exception:
        pass

    # Table width
    total_twips = sum(_cm_to_twips(c) for c in col_widths_cm)
    try:
        tblW_xml = parse_xml(
            r'<w:tblW %s w:w="%d" w:type="dxa"/>' % (nsdecls("w"), total_twips)
        )
        tblPr.append(tblW_xml)
    except Exception:
        pass

    # Build tblGrid
    try:
        tblGrid = OxmlElement("w:tblGrid")
        for w in col_widths_cm:
            gridCol = OxmlElement("w:gridCol")
            gridCol.set(qn("w:w"), str(_cm_to_twips(w)))
            tblGrid.append(gridCol)
        tbl.append(tblGrid)
    except Exception:
        pass


def _set_cell_width(cell, width_cm: float) -> None:
    """Set cell width at XML level with zero margins."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()

    tcW_nodes = tcPr.xpath("./w:tcW")
    if tcW_nodes:
        tcW = tcW_nodes[0]
        tcW.set(qn("w:w"), str(_cm_to_twips(width_cm)))
        tcW.set(qn("w:type"), "dxa")
    else:
        new_tcW = OxmlElement("w:tcW")
        new_tcW.set(qn("w:w"), str(_cm_to_twips(width_cm)))
        new_tcW.set(qn("w:type"), "dxa")
        tcPr.append(new_tcW)

    # Zero cell margins
    for node in tcPr.xpath("./w:tcMar"):
        tcPr.remove(node)
    tcMar_xml = parse_xml(
        r"<w:tcMar %s>"
        r'<w:left w:w="0" w:type="dxa"/>'
        r'<w:right w:w="0" w:type="dxa"/>'
        r'<w:top w:w="0" w:type="dxa"/>'
        r'<w:bottom w:w="0" w:type="dxa"/>'
        r"</w:tcMar>" % nsdecls("w")
    )
    tcPr.append(tcMar_xml)


def _force_table_cell_widths(table, col_widths_cm: list[float]) -> None:
    for r in table.rows:
        for ci, cell in enumerate(r.cells):
            _set_cell_width(cell, col_widths_cm[ci])


def _build_docx(labels: list[str], config: dict) -> io.BytesIO:
    """Build a Word document with labels and return as BytesIO buffer."""
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Cm(A4_W_CM)
    sec.page_height = Cm(A4_H_CM)
    sec.top_margin = Cm(config["margins_cm"]["top"])
    sec.bottom_margin = Cm(config["margins_cm"]["bottom"])
    sec.left_margin = Cm(config["margins_cm"]["left"])
    sec.right_margin = Cm(config["margins_cm"]["right"])

    pos = 0
    total = len(labels)

    while pos < total:
        if config["has_row_gutters"]:
            actual_rows = config["rows_per_page"] * 2 - 1
        else:
            actual_rows = config["rows_per_page"]

        table = doc.add_table(
            rows=actual_rows, cols=len(config["col_widths_cm"])
        )
        table.autofit = False
        table.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

        _set_table_xml_enforced(table, config["col_widths_cm"])
        _force_table_cell_widths(table, config["col_widths_cm"])

        for ci, w in enumerate(config["col_widths_cm"]):
            table.rows[0].cells[ci].width = Cm(w)

        row_idx = 0
        for label_row in range(config["rows_per_page"]):
            r = table.rows[row_idx]
            r.height = Cm(config["row_h_cm"])
            r.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY

            for ci, cell in enumerate(r.cells):
                if ci in config["label_col_idx"] and pos < total:
                    lab = labels[pos]

                    for p in cell.paragraphs:
                        p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
                    try:
                        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
                    except Exception:
                        pass

                    if not lab:
                        pos += 1
                        continue

                    p = cell.paragraphs[0]
                    p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

                    run_header = p.add_run("BHARAT\n")
                    run_header.font.name = config["font"]
                    run_header.font.size = Pt(config["font_size_header"])
                    run_header.bold = True

                    run_text = p.add_run(lab)
                    run_text.font.name = config["font"]
                    run_text.font.size = Pt(config["font_size"])

                    pos += 1

            row_idx += 1

            if (
                config["has_row_gutters"]
                and label_row < config["rows_per_page"] - 1
            ):
                gutter_row = table.rows[row_idx]
                gutter_row.height = Cm(config["row_gutter_h_cm"])
                gutter_row.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY
                row_idx += 1

        if pos < total:
            doc.add_page_break()

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


def generate_label_zip(
    participant_codes: list[str],
    date_str: str = "",
) -> io.BytesIO:
    """
    Generate all 5 label documents and return as a ZIP file in memory.

    Args:
        participant_codes: List of participant codes (e.g. ["1A-001", "2B-045"])
        date_str: Optional date string appended to filenames

    Returns:
        BytesIO containing a ZIP with 5 .docx files
    """
    codes = sorted(participant_codes)
    collections = _create_label_collections(codes)
    suffix = f"_{date_str}" if date_str else ""

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Cryovial labels (5 per row)
        cryo_buf = _build_docx(collections["cryovial"], CRYO_CONFIG)
        zf.writestr(f"labels_cryovial{suffix}.docx", cryo_buf.read())

        # Urine labels (5 per row, same cryo layout)
        urine_buf = _build_docx(collections["urine"], CRYO_CONFIG)
        zf.writestr(f"labels_urine{suffix}.docx", urine_buf.read())

        # Normal labels (4 per row each)
        for group_name in ["epigenetics", "samples", "edta", "sst_fl_blood"]:
            buf = _build_docx(collections[group_name], NORMAL_CONFIG)
            zf.writestr(f"labels_{group_name}{suffix}.docx", buf.read())

    zip_buf.seek(0)
    return zip_buf


def generate_single_label_doc(
    participant_codes: list[str],
    group: str,
) -> io.BytesIO:
    """
    Generate a single label group document.

    Args:
        participant_codes: List of participant codes
        group: One of 'cryovial', 'epigenetics', 'samples', 'edta', 'sst_fl_blood'

    Returns:
        BytesIO containing a .docx file
    """
    if group not in LABEL_GROUPS:
        raise ValueError(f"Invalid group '{group}'. Must be one of: {list(LABEL_GROUPS.keys())}")

    codes = sorted(participant_codes)
    collections = _create_label_collections(codes)
    config = CRYO_CONFIG if group in ("cryovial", "urine") else NORMAL_CONFIG
    return _build_docx(collections[group], config)
