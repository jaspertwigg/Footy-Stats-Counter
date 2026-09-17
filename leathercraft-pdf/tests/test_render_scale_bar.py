"""Verifies the scale bar actually lands in the generated PDF at the right
size, by decoding the raw PDF content stream rather than trusting the
drawing code -- reportlab's own coordinates could look right in the source
while still ending up wrong on the page (e.g. an unintended extra
transform), so this checks the artifact itself.
"""

import base64
import re
import zlib

from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.packing import pack_pieces
from leathercraft_pdf.pieces import Piece
from leathercraft_pdf.render import (
    SCALE_BAR_HEIGHT_CM,
    SCALE_BAR_WIDTH_CM,
    PackedPageJob,
    PiecePlacement,
    draw_pdf,
)

MM_PER_PT = 25.4 / 72.0


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
                # Strip exactly the 2-byte EOF marker, not a run of any
                # trailing '~'/'>' chars -- rstrip(b"~>") treats its
                # argument as a *character set* and can eat real trailing
                # base85 data that happens to end in '>' too.
                if raw.endswith(b"~>"):
                    raw = raw[:-2]
                raw = base64.a85decode(raw, adobe=False)
            if b"FlateDecode" in header:
                raw = zlib.decompress(raw)
            out.append(raw.decode("latin1"))
        except Exception:
            continue
    return out


MARGIN_MM = 10.0


def _build_single_page_pdf(tmp_path):
    piece = Piece(polylines=[[(0, 0), (20, 0), (20, 15), (0, 15), (0, 0)]], bbox=(0, 0, 20, 15))
    packed_pages, _ = pack_pieces([piece], PAGE_SIZES_MM["A4"], margin_mm=MARGIN_MM)
    pages = [
        PackedPageJob(
            placements=[
                PiecePlacement(polylines=piece.polylines, offset_x=ox, offset_y=oy)
                for p, ox, oy in packed_pages[0].placements
            ]
        )
    ]
    out = str(tmp_path / "out.pdf")
    draw_pdf(out, pages, PAGE_SIZES_MM["A4"], MARGIN_MM, "test.dxf")
    return open(out, "rb").read()


def test_scale_bar_labels_present(tmp_path):
    text = _extract_content_streams(_build_single_page_pdf(tmp_path))[0]
    labels = re.findall(r"\((.*?)\) Tj", text)
    assert f"{SCALE_BAR_WIDTH_CM:g}cm" in labels
    assert f"{SCALE_BAR_HEIGHT_CM:g}cm" in labels


def test_scale_bar_arms_are_true_length_and_perpendicular(tmp_path):
    text = _extract_content_streams(_build_single_page_pdf(tmp_path))[0]
    paths = re.findall(r"((?:[\d.]+ [\d.]+ m\s*)(?:[\d.]+ [\d.]+ l\s*)*S)", text)

    horizontal_lengths = []
    vertical_lengths = []
    for p in paths:
        coords = [(float(x) * MM_PER_PT, float(y) * MM_PER_PT) for x, y in re.findall(r"([\d.]+) ([\d.]+) [ml]", p)]
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if h < 1e-6 and w > 1:
            horizontal_lengths.append(w)
        elif w < 1e-6 and h > 1:
            vertical_lengths.append(h)

    assert any(abs(length - SCALE_BAR_WIDTH_CM * 10.0) < 0.05 for length in horizontal_lengths)
    assert any(abs(length - SCALE_BAR_HEIGHT_CM * 10.0) < 0.05 for length in vertical_lengths)


def test_scale_bar_sits_inside_the_printable_boundary(tmp_path):
    """The scale bar's own corner must be at or past the printable area's
    edge (x, y >= margin_mm), not out in the margin where a printer's own
    non-printable border could clip it before it's ever measurable.
    """
    text = _extract_content_streams(_build_single_page_pdf(tmp_path))[0]
    paths = re.findall(r"((?:[\d.]+ [\d.]+ m\s*)(?:[\d.]+ [\d.]+ l\s*)*S)", text)

    corner_candidates = []
    for p in paths:
        coords = [(float(x) * MM_PER_PT, float(y) * MM_PER_PT) for x, y in re.findall(r"([\d.]+) ([\d.]+) [ml]", p)]
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if (h < 1e-6 and abs(w - SCALE_BAR_WIDTH_CM * 10.0) < 0.05) or (
            w < 1e-6 and abs(h - SCALE_BAR_HEIGHT_CM * 10.0) < 0.05
        ):
            corner_candidates.append(min(xs))
            corner_candidates.append(min(ys))

    assert corner_candidates, "scale bar arms not found"
    assert all(v >= MARGIN_MM - 1e-6 for v in corner_candidates)
