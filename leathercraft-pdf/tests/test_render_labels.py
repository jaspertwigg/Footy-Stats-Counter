"""Verifies, from the actual PDF bytes, how a piece's name (from --label)
and its "Cut N" count combine into one label -- name and count in one
consistent font size, the count in parentheses -- and that a "horizontal"
piece's label rotates 90 degrees clockwise. Decodes the real content
stream rather than trusting the drawing code, the same way
test_render_scale_bar.py does.
"""

import base64
import re
import zlib

from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.render import (
    PIECE_LABEL_FONT_SIZE,
    PackedPageJob,
    PiecePlacement,
    draw_pdf,
)


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


def _render_one_piece(tmp_path, shape_label, cut_label):
    piece_polylines = [[(0, 0), (20, 0), (20, 15), (0, 15), (0, 0)]]
    placement = PiecePlacement(
        polylines=piece_polylines, offset_x=50.0, offset_y=50.0,
        footer_label="piece 1/1", cut_label=cut_label, shape_label=shape_label,
        centroid=(10.0, 7.5),
    )
    pages = [PackedPageJob(placements=[placement])]
    out = str(tmp_path / "out.pdf")
    draw_pdf(out, pages, PAGE_SIZES_MM["A4"], 10.0, "test.dxf", "")
    return _extract_content_streams(open(out, "rb").read())[0]


def _unescape_pdf_string(s: str) -> str:
    # reportlab escapes literal ( ) \ inside PDF string literals.
    return s.replace("\\(", "(").replace("\\)", ")").replace("\\\\", "\\")


def _drawn_texts(content: str):
    """All strings actually drawn with Tj, in document order, unescaped."""
    return [_unescape_pdf_string(m) for m in re.findall(r"\((.*?(?<!\\))\) Tj", content)]


def _font_size_for_text(content: str, text: str):
    """Font size active when `text` was drawn.

    reportlab emits one BT..ET block per font-size change and a separate
    one per text draw, in that order -- track the most recently set size
    as we scan and report it against a Tj block that matches `text`.
    """
    target = text.replace("(", "\\(").replace(")", "\\)")
    current_size = None
    for block in re.findall(r"BT(.*?)ET", content, re.DOTALL):
        m = re.search(r"/F\d+ ([\d.]+) Tf", block)
        if m:
            current_size = float(m.group(1))
            continue
        if f"({target}) Tj" in block:
            return current_size
    return None


def test_name_and_cut_count_combine_into_one_bracketed_line(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label="Cut 2")
    assert "Outer Shell (Cut 2)" in _drawn_texts(content)


def test_cut_label_alone_is_still_parenthesized(tmp_path):
    content = _render_one_piece(tmp_path, shape_label=None, cut_label="Cut 3")
    assert "(Cut 3)" in _drawn_texts(content)


def test_name_alone_has_no_brackets(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label=None)
    assert "Outer Shell" in _drawn_texts(content)


def test_all_label_variants_use_the_same_font_size(tmp_path):
    combined = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label="Cut 2")
    name_only = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label=None)
    cut_only = _render_one_piece(tmp_path, shape_label=None, cut_label="Cut 3")

    assert _font_size_for_text(combined, "Outer Shell (Cut 2)") == PIECE_LABEL_FONT_SIZE
    assert _font_size_for_text(name_only, "Outer Shell") == PIECE_LABEL_FONT_SIZE
    assert _font_size_for_text(cut_only, "(Cut 3)") == PIECE_LABEL_FONT_SIZE


def test_horizontal_named_piece_gets_rotated_text(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Horizontal Pocket Divider", cut_label=None)
    # A -90 degree (clockwise) rotation emits a "0 -1 1 0" concat matrix
    # (cos, sin, -sin, cos for theta=-90 -> 0, -1, 1, 0) before the text.
    assert re.search(r"0 -1 1 0 [\d.]+ [\d.]+ cm", content)


def test_non_horizontal_named_piece_is_not_rotated(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label=None)
    assert re.search(r"0 -1 1 0 [\d.]+ [\d.]+ cm", content) is None
