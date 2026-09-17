from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.packing import pack_pieces
from leathercraft_pdf.pieces import Piece


def _piece(w, h, x=0, y=0):
    poly = [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
    return Piece(polylines=[poly], bbox=(x, y, x + w, y + h))


def test_small_pieces_are_never_split_across_pages():
    pieces = [_piece(50, 40) for _ in range(6)]
    packed_pages, oversized = pack_pieces(pieces, PAGE_SIZES_MM["A4"], margin_mm=10)
    assert oversized == []
    # Every piece appears exactly once, whole, across the packed pages.
    all_placed = [p for page in packed_pages for p, _, _ in page.placements]
    assert len(all_placed) == len(pieces)


def test_pieces_bigger_than_a_page_are_routed_to_oversized():
    small = _piece(50, 40)
    huge = _piece(400, 400)
    packed_pages, oversized = pack_pieces([small, huge], PAGE_SIZES_MM["A4"], margin_mm=10)
    assert oversized == [huge]
    all_placed = [p for page in packed_pages for p, _, _ in page.placements]
    assert all_placed == [small]


def test_placed_pieces_stay_within_the_printable_area():
    page = PAGE_SIZES_MM["A4"]
    margin = 10
    printable_w, printable_h = page[0] - 2 * margin, page[1] - 2 * margin
    pieces = [_piece(60, 50) for _ in range(10)]
    packed_pages, _ = pack_pieces(pieces, page, margin_mm=margin)
    for pg in packed_pages:
        for piece, ox, oy in pg.placements:
            minx, miny, maxx, maxy = piece.bbox
            x0, y0 = minx + ox, miny + oy
            x1, y1 = maxx + ox, maxy + oy
            assert x0 >= -1e-9 and y0 >= -1e-9
            assert x1 <= printable_w + 1e-6 and y1 <= printable_h + 1e-6


def test_placed_pieces_on_the_same_page_do_not_overlap():
    page = PAGE_SIZES_MM["A4"]
    pieces = [_piece(60, 50) for _ in range(4)]
    packed_pages, _ = pack_pieces(pieces, page, margin_mm=10)

    def placed_rect(piece, ox, oy):
        minx, miny, maxx, maxy = piece.bbox
        return (minx + ox, miny + oy, maxx + ox, maxy + oy)

    for pg in packed_pages:
        rects = [placed_rect(p, ox, oy) for p, ox, oy in pg.placements]
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                ax0, ay0, ax1, ay1 = rects[i]
                bx0, by0, bx1, by1 = rects[j]
                overlap = not (ax1 <= bx0 or bx1 <= ax0 or ay1 <= by0 or by1 <= ay0)
                assert not overlap
