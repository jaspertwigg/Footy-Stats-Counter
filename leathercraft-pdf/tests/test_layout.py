import pytest

from leathercraft_pdf.layout import compute_tiles, needs_tiling, PAGE_SIZES_MM


def test_small_pattern_fits_one_page():
    bbox = (0, 0, 100, 50)
    page = PAGE_SIZES_MM["A4"]
    assert not needs_tiling(bbox, page, margin_mm=10)
    tiles = compute_tiles(bbox, page, margin_mm=10, overlap_mm=15)
    assert len(tiles) == 1
    assert tiles[0].rect == (0, 0, 100, 50)


def test_large_pattern_is_tiled_with_full_coverage():
    bbox = (0, 0, 400, 200)
    page = PAGE_SIZES_MM["A4"]
    margin, overlap = 10, 15
    assert needs_tiling(bbox, page, margin)
    tiles = compute_tiles(bbox, page, margin, overlap)
    assert len(tiles) > 1

    # Every tile must stay within the pattern bounds and within one
    # printable page area.
    printable_w = page[0] - 2 * margin
    printable_h = page[1] - 2 * margin
    for t in tiles:
        x0, y0, x1, y1 = t.rect
        assert x0 >= -1e-9 and x1 <= 400 + 1e-9
        assert y0 >= -1e-9 and y1 <= 200 + 1e-9
        assert x1 - x0 <= printable_w + 1e-6
        assert y1 - y0 <= printable_h + 1e-6

    # The whole pattern width/height must be covered by the union of tiles
    # in each row/column (no gaps).
    col_rects = sorted({(t.col, t.rect[0], t.rect[2]) for t in tiles if t.row == 0})
    xs = sorted(col_rects, key=lambda r: r[1])
    covered_to = 0.0
    for _, x0, x1 in xs:
        assert x0 <= covered_to + 1e-6, "gap between tiles"
        covered_to = max(covered_to, x1)
    assert covered_to >= 400 - 1e-6


def test_overlap_between_adjacent_tiles_in_a_row():
    bbox = (0, 0, 400, 100)
    page = PAGE_SIZES_MM["A4"]
    margin, overlap = 10, 15
    tiles = [t for t in compute_tiles(bbox, page, margin, overlap) if t.row == 0]
    tiles.sort(key=lambda t: t.rect[0])
    for a, b in zip(tiles, tiles[1:]):
        overlap_width = a.rect[2] - b.rect[0]
        assert overlap_width == pytest.approx(overlap, abs=1e-6) or overlap_width >= overlap - 1e-6


def test_overlap_smaller_than_page_required():
    bbox = (0, 0, 1000, 1000)
    page = PAGE_SIZES_MM["A4"]
    with pytest.raises(ValueError):
        compute_tiles(bbox, page, margin_mm=10, overlap_mm=1000)
