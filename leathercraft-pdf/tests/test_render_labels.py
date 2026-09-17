"""Verifies, from the actual PDF bytes, that a piece's label -- its name
and/or "Cut N" count -- wraps and shrinks to fit within the piece's own
bounding box, with the cut count always on a separate line from the name.
Decodes the real content stream rather than trusting the drawing code, the
same way test_render_scale_bar.py does.
"""

import base64
import re
import zlib

from reportlab.pdfbase.pdfmetrics import stringWidth

from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.render import (
    MAX_PIECE_LABEL_FONT_SIZE,
    MIN_PIECE_LABEL_FONT_SIZE,
    PIECE_LABEL_FONT,
    PIECE_LABEL_WIDTH_FRACTION,
    PackedPageJob,
    PiecePlacement,
    draw_pdf,
)

MM_TO_PT = 72.0 / 25.4


def _extract_content_streams(pdf_bytes: bytes):
    idx = 0
    out = []
    while True:
        s = pdf_bytes.find(b"stream", idx)
        if s == -1:
            break
        start = s + len(b"stream")
        if pdf_bytes[start : start + 2] == b"\r\n":
            start += 2
        elif pdf_bytes[start : start + 1] == b"\n":
            start += 1
        end = pdf_bytes.find(b"endstream", start)
        raw = pdf_bytes[start:end].rstrip(b"\r\n")
        idx = end + len(b"endstream")
        header = pdf_bytes[max(0, s - 300) : s]
        try:
            if b"ASCII85Decode" in header:
                raw = base64.a85decode(raw.rstrip(b"~>"), adobe=False)
            if b"FlateDecode" in header:
                raw = zlib.decompress(raw)
            out.append(raw.decode("latin1"))
        except Exception:
            continue
    return out


def _render_one_piece(tmp_path, shape_label, cut_label, piece_w_mm=60.0, piece_h_mm=60.0):
    hw, hh = piece_w_mm / 2.0, piece_h_mm / 2.0
    piece_polylines = [[(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh), (-hw, -hh)]]
    placement = PiecePlacement(
        polylines=piece_polylines, offset_x=100.0, offset_y=100.0,
        footer_label="piece 1/1", cut_label=cut_label, shape_label=shape_label,
        centroid=(0.0, 0.0), piece_size_mm=(piece_w_mm, piece_h_mm),
    )
    pages = [PackedPageJob(placements=[placement])]
    out = str(tmp_path / "out.pdf")
    draw_pdf(out, pages, PAGE_SIZES_MM["A4"], 10.0, "test.dxf", "")
    return _extract_content_streams(open(out, "rb").read())[0]


def _unescape_pdf_string(s: str) -> str:
    return s.replace("\\(", "(").replace("\\)", ")").replace("\\\\", "\\")


def _label_text_blocks(content: str):
    """(font_size, text, y_baseline) for every Tj drawn on the piece label
    (font F2, the Helvetica-Bold resource reportlab assigns after F1 is
    used for the page footer) -- in document order, tracking the most
    recent Tf and Tm as we scan.
    """
    results = []
    current_size = None
    current_y = None
    for block in re.findall(r"BT(.*?)ET", content, re.DOTALL):
        tf = re.search(r"/F\d+ ([\d.]+) Tf", block)
        if tf:
            current_size = float(tf.group(1))
            continue
        tm = re.search(r"1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm", block)
        if tm:
            current_y = float(tm.group(2))
        m = re.search(r"\((.*?(?<!\\))\) Tj", block)
        if m:
            text = _unescape_pdf_string(m.group(1))
            # Skip page furniture (footer, scale bar, date) -- easy to tell
            # apart since none of it looks like a piece label in these tests.
            if "|" in text or text in ("5cm", "3cm") or re.match(r"^\d{4}-\d{2}-\d{2}$", text):
                continue
            results.append((current_size, text, current_y))
    return results


def test_cut_count_is_a_separate_text_from_the_name(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label="Cut 2")
    texts = [t for _, t, _ in _label_text_blocks(content)]
    assert "Outer Shell" in texts
    assert "(Cut 2)" in texts
    # Not merged into one string anymore.
    assert "Outer Shell (Cut 2)" not in texts


def test_cut_count_line_is_below_the_name_line(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label="Cut 2")
    blocks = {text: y for _, text, y in _label_text_blocks(content)}
    assert blocks["(Cut 2)"] < blocks["Outer Shell"]


def test_long_name_wraps_across_multiple_lines(tmp_path):
    # Comfortably too long to fit one line even at the smallest size on a
    # narrow piece.
    content = _render_one_piece(
        tmp_path, shape_label="A Very Long Descriptive Pocket Name Indeed", cut_label=None,
        piece_w_mm=25.0, piece_h_mm=60.0,
    )
    texts = [t for _, t, _ in _label_text_blocks(content)]
    assert len(texts) > 1


def test_every_label_line_fits_within_the_piece_width(tmp_path):
    piece_w_mm = 30.0
    content = _render_one_piece(
        tmp_path, shape_label="A Very Long Descriptive Pocket Name Indeed", cut_label="Cut 4",
        piece_w_mm=piece_w_mm, piece_h_mm=80.0,
    )
    max_allowed_pt = piece_w_mm * MM_TO_PT  # generous: full width, not just the inset fraction
    for size, text, _ in _label_text_blocks(content):
        assert stringWidth(text, PIECE_LABEL_FONT, size) <= max_allowed_pt + 1e-6


def test_small_piece_gets_a_smaller_font_than_a_large_one(tmp_path):
    small = _render_one_piece(tmp_path, shape_label="Card Pocket", cut_label=None, piece_w_mm=15.0, piece_h_mm=15.0)
    large = _render_one_piece(tmp_path, shape_label="Card Pocket", cut_label=None, piece_w_mm=200.0, piece_h_mm=200.0)
    small_size = _label_text_blocks(small)[0][0]
    large_size = _label_text_blocks(large)[0][0]
    assert small_size < large_size
    assert MIN_PIECE_LABEL_FONT_SIZE <= small_size <= MAX_PIECE_LABEL_FONT_SIZE
    assert large_size == MAX_PIECE_LABEL_FONT_SIZE


def test_width_fraction_leaves_an_inset(tmp_path):
    assert 0 < PIECE_LABEL_WIDTH_FRACTION < 1


def test_horizontal_named_piece_gets_rotated_text(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Horizontal Pocket Divider", cut_label=None)
    # A -90 degree (clockwise) rotation emits a "0 -1 1 0" concat matrix
    # (cos, sin, -sin, cos for theta=-90 -> 0, -1, 1, 0) before the text.
    assert re.search(r"0 -1 1 0 [\d.]+ [\d.]+ cm", content)


def test_non_horizontal_named_piece_is_not_rotated(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label=None)
    assert re.search(r"0 -1 1 0 [\d.]+ [\d.]+ cm", content) is None
