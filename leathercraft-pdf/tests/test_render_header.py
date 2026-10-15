"""Verifies the header shows a cleaned-up pattern name (not the literal
filename) and that a small page-number indicator appears only when
there's more than one page -- by decoding the actual PDF content stream,
the same way the other render tests do.
"""

import base64
import re
import zlib

from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.render import PackedPageJob, PiecePlacement, _clean_title, draw_pdf


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
                if raw.endswith(b"~>"):
                    raw = raw[:-2]
                raw = base64.a85decode(raw, adobe=False)
            if b"FlateDecode" in header:
                raw = zlib.decompress(raw)
            out.append(raw.decode("latin1"))
        except Exception:
            continue
    return out


def _texts(content: str):
    return [s.replace("\\(", "(").replace("\\)", ")") for s in re.findall(r"\((.*?(?<!\\))\) Tj", content)]


def _one_piece_page():
    return PackedPageJob(
        placements=[PiecePlacement(polylines=[[(0, 0), (20, 0), (20, 15), (0, 15), (0, 0)]], offset_x=50.0, offset_y=50.0)]
    )


def test_clean_title_strips_extension_and_copy_suffix():
    assert _clean_title("Classic_Trifold_-_Copy.lcc") == "Classic Trifold"
    assert _clean_title("Horizontal_Card_Holder_-_Copy.lcc") == "Horizontal Card Holder"
    assert _clean_title("simple_panel.dxf") == "simple panel"
    assert _clean_title("/some/path/Already Nice Name.lcc") == "Already Nice Name"


def test_clean_title_strips_a_leading_upload_hash_prefix():
    assert _clean_title("3a28aeb7-Horizontal_Card_Holder_-_Copy.lcc") == "Horizontal Card Holder"
    assert _clean_title("/path/c0025608-Vertical_Card_Holder_-_Copy.lcc") == "Vertical Card Holder"


def test_header_shows_the_cleaned_title_not_the_raw_filename(tmp_path):
    out = str(tmp_path / "out.pdf")
    draw_pdf(out, [_one_piece_page()], PAGE_SIZES_MM["A4"], 10.0, "Classic_Trifold_-_Copy.lcc")
    texts = _texts(_extract_content_streams(open(out, "rb").read())[0])
    assert "Classic Trifold" in texts
    assert "Classic_Trifold_-_Copy.lcc" not in texts


def test_no_page_number_on_a_single_page_job(tmp_path):
    out = str(tmp_path / "out.pdf")
    draw_pdf(out, [_one_piece_page()], PAGE_SIZES_MM["A4"], 10.0, "test.dxf")
    texts = _texts(_extract_content_streams(open(out, "rb").read())[0])
    assert not any("/" in t for t in texts)


def test_page_number_appears_on_each_page_of_a_multi_page_job(tmp_path):
    pages = [_one_piece_page(), _one_piece_page(), _one_piece_page()]
    out = str(tmp_path / "out.pdf")
    draw_pdf(out, pages, PAGE_SIZES_MM["A4"], 10.0, "test.dxf")
    streams = _extract_content_streams(open(out, "rb").read())
    assert len(streams) == 3
    for i, content in enumerate(streams, start=1):
        assert f"{i} / 3" in _texts(content)
