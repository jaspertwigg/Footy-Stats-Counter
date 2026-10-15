from leathercraft_pdf.cli import _plan
from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.packing import SOLO_LARGEST_COUNT
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


def test_relaxing_solo_isolation_can_save_a_page():
    # Five near-uniform pieces (a real card-holder pattern: four ~102x55
    # overlays plus one ~102x86) -- isolating the "two largest" by the
    # default rule burns two pages on pieces barely bigger than the rest,
    # pushing everything over what should fit in two pages total. Passing
    # a smaller solo_largest_count is how the CLI's own orientation/page
    # search claws that page back.
    pieces = [_piece(102, 86)] + [_piece(102, 55) for _ in range(4)]
    a4 = PAGE_SIZES_MM["A4"]
    margin, overlap = 10.0, 15.0

    _, default_oversized, default_total = _plan(pieces, a4, margin, overlap)
    _, relaxed_oversized, relaxed_total = _plan(pieces, a4, margin, overlap, solo_largest_count=0)

    assert default_oversized == relaxed_oversized == []
    assert relaxed_total < default_total
    assert relaxed_total <= 2


def test_plan_default_solo_largest_count_matches_packing_default():
    # _plan's own default must track packing.SOLO_LARGEST_COUNT, not drift
    # from it -- otherwise the CLI's "how much did we relax by" reporting
    # would compare against the wrong baseline.
    pieces = [_piece(60, 40)]
    a4 = PAGE_SIZES_MM["A4"]
    explicit = _plan(pieces, a4, 10.0, 15.0, solo_largest_count=SOLO_LARGEST_COUNT)
    default = _plan(pieces, a4, 10.0, 15.0)
    assert explicit == default
