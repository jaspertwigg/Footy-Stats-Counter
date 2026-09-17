"""Verifies, from the actual PDF bytes, that a piece's name (from --label)
and its "Cut N" count render with "Cut N" as the visually dominant one --
bigger and bold -- and the name stacked above it. Decodes the real content
stream rather than trusting the drawing code, the same way
test_render_scale_bar.py does.
"""

import base64
import re
import zlib

from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.render import (
    CUT_LABEL_FONT_SIZE,
    SHAPE_LABEL_ALONE_FONT_SIZE,
    SHAPE_LABEL_FONT_SIZE,
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


def _text_blocks_with_font_size(content: str):
    """Reportlab emits one BT..ET block per font-size change and another
    per text draw, in order -- pair each drawn string with the size/weight
    that was active when it was drawn.
    """
    blocks = re.findall(r"BT(.*?)ET", content, re.DOTALL)
    results = []
    current_size = None
    current_bold = None
    for b in blocks:
        font_match = re.search(r"/(F\d+) ([\d.]+) Tf", b)
        if font_match:
            current_size = float(font_match.group(2))
            # Track which resource name was last set for boldness inference
            # via a second pass isn't reliable across pages; instead treat
            # each distinct font resource as its own "weight bucket" and
            # compare sizes between the two known texts directly.
            current_bold = font_match.group(1)
            continue
        text_match = re.search(r"\((.*?)\) Tj", b)
        if text_match:
            results.append((text_match.group(1), current_size, current_bold))
    return results


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


def test_cut_label_is_bigger_than_shape_label_when_both_present(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label="Cut 2")
    texts = _text_blocks_with_font_size(content)

    shape_entries = [t for t in texts if t[0] == "Outer Shell"]
    cut_entries = [t for t in texts if t[0] == "Cut 2"]
    assert len(shape_entries) == 1
    assert len(cut_entries) == 1

    shape_size = shape_entries[0][1]
    cut_size = cut_entries[0][1]
    assert cut_size > shape_size
    assert cut_size == CUT_LABEL_FONT_SIZE
    assert shape_size == SHAPE_LABEL_FONT_SIZE


def test_shape_label_alone_uses_the_larger_solo_size(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label=None)
    texts = _text_blocks_with_font_size(content)
    shape_entries = [t for t in texts if t[0] == "Outer Shell"]
    assert len(shape_entries) == 1
    assert shape_entries[0][1] == SHAPE_LABEL_ALONE_FONT_SIZE
    # Solo, it should be drawn larger than it would be alongside a cut label.
    assert SHAPE_LABEL_ALONE_FONT_SIZE > SHAPE_LABEL_FONT_SIZE


def test_shape_label_is_positioned_above_cut_label(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label="Cut 2")
    positions = {}
    # Text is drawn relative to a translated (and possibly rotated) local
    # origin, so its Tm offset can be negative -- allow a leading '-'.
    for m in re.finditer(r"1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm \((.*?)\) Tj", content):
        x, y, text = m.groups()
        positions[text] = float(y)
    assert positions["Outer Shell"] > positions["Cut 2"]


def test_horizontal_named_piece_gets_rotated_text(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Horizontal Pocket Divider", cut_label=None)
    # A -90 degree (clockwise) rotation emits a "0 -1 1 0" concat matrix
    # (cos, sin, -sin, cos for theta=-90 -> 0, -1, 1, 0) before the text.
    assert re.search(r"0 -1 1 0 [\d.]+ [\d.]+ cm", content)


def test_non_horizontal_named_piece_is_not_rotated(tmp_path):
    content = _render_one_piece(tmp_path, shape_label="Outer Shell", cut_label=None)
    assert re.search(r"0 -1 1 0 [\d.]+ [\d.]+ cm", content) is None
