from leathercraft_pdf.cli import _plan
from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.pieces import Piece


def _piece(w, h):
    poly = [(0, 0), (w, 0), (w, h), (0, h), (0, 0)]
    return Piece(polylines=[poly], bbox=(0, 0, w, h))


def test_wide_piece_is_oversized_in_portrait_but_fits_landscape():
    # 222mm wide: fits A4 landscape's printable width (277mm) but not
    # portrait's (190mm), the exact scenario from the real bifold wallet.
    pieces = [_piece(222, 86)]
    a4 = PAGE_SIZES_MM["A4"]
    landscape = (a4[1], a4[0])
    margin, overlap = 10.0, 15.0

    _, portrait_oversized, portrait_total = _plan(pieces, a4, margin, overlap)
    _, landscape_oversized, landscape_total = _plan(pieces, landscape, margin, overlap)

    assert len(portrait_oversized) == 1
    assert len(landscape_oversized) == 0
    assert landscape_total < portrait_total


def test_small_piece_is_never_oversized_in_either_orientation():
    pieces = [_piece(60, 40)]
    a4 = PAGE_SIZES_MM["A4"]
    landscape = (a4[1], a4[0])
    margin, overlap = 10.0, 15.0

    _, portrait_oversized, _ = _plan(pieces, a4, margin, overlap)
    _, landscape_oversized, _ = _plan(pieces, landscape, margin, overlap)
    assert portrait_oversized == []
    assert landscape_oversized == []
