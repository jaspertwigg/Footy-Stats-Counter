from leathercraft_pdf.layout import PAGE_SIZES_MM
from leathercraft_pdf.packing import _group_by_similar_size, pack_pieces
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


def test_two_largest_pieces_get_their_own_page():
    big1 = _piece(150, 100)
    big2 = _piece(140, 95)
    smalls = [_piece(30, 20) for _ in range(6)]
    packed_pages, oversized = pack_pieces([big1] + smalls + [big2], PAGE_SIZES_MM["A4"], margin_mm=10)
    assert oversized == []

    assert len(packed_pages[0].placements) == 1
    assert len(packed_pages[1].placements) == 1
    large_ids = {id(packed_pages[0].placements[0][0]), id(packed_pages[1].placements[0][0])}
    assert large_ids == {id(big1), id(big2)}

    for pg in packed_pages[2:]:
        for piece, _, _ in pg.placements:
            assert id(piece) not in large_ids


def test_group_by_similar_size_clusters_matching_dimensions_together():
    a1, a2 = _piece(80, 60), _piece(81, 59)
    b1, b2 = _piece(30, 20), _piece(29, 21)
    grouped = _group_by_similar_size([b1, a1, b2, a2], tolerance_mm=8.0)
    assert grouped == [a1, a2, b2, b1]


def test_similar_sized_pieces_land_on_the_same_page_when_they_fit_together():
    page = PAGE_SIZES_MM["A4"]
    # `big` are the largest here and get soloed out (tested separately above);
    # `mediums` should then land together rather than scattered one-per-page
    # mixed in with `tiny`.
    big = [_piece(150, 100) for _ in range(2)]
    mediums = [_piece(80, 60) for _ in range(4)]
    tiny = [_piece(15, 10) for _ in range(4)]
    packed_pages, oversized = pack_pieces(big + mediums + tiny, page, margin_mm=10)
    assert oversized == []

    def sizes_on_page(pg):
        return {round(p.bbox[2] - p.bbox[0]) for p, _, _ in pg.placements}

    medium_pages = [pg for pg in packed_pages if 80 in sizes_on_page(pg)]
    # All 4 mediums should be together on the medium page(s), not scattered
    # across many pages each mixed in with other sizes.
    medium_count = sum(1 for pg in medium_pages for p, _, _ in pg.placements if round(p.bbox[2] - p.bbox[0]) == 80)
    assert medium_count == 4
    assert len(medium_pages) == 1


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
