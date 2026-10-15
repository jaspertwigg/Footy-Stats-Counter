import pytest

from leathercraft_pdf.pieces import Piece, flip_vertical, rotate_90


def test_flip_vertical_mirrors_points_about_bbox_center():
    # A trapezoid: wide at y=0, narrow at y=20.
    poly = [(0, 0), (20, 0), (15, 20), (5, 20), (0, 0)]
    piece = Piece(polylines=[poly], bbox=(0, 0, 20, 20))
    flip_vertical(piece)
    assert piece.polylines[0] == [(0, 20), (20, 20), (15, 0), (5, 0), (0, 20)]


def test_flip_vertical_preserves_the_bounding_box():
    poly = [(0, 0), (20, 0), (15, 20), (5, 20), (0, 0)]
    piece = Piece(polylines=[poly], bbox=(0, 0, 20, 20))
    flip_vertical(piece)
    # bbox is a fixed field, not recomputed -- but the actual point extents
    # should still land within the original box after the mirror.
    xs = [p[0] for p in piece.polylines[0]]
    ys = [p[1] for p in piece.polylines[0]]
    assert min(xs) >= 0 and max(xs) <= 20
    assert min(ys) >= 0 and max(ys) <= 20


def test_flip_vertical_twice_restores_the_original():
    poly = [(0, 0), (20, 0), (15, 20), (5, 20), (0, 0)]
    piece = Piece(polylines=[poly], bbox=(0, 0, 20, 20))
    flip_vertical(piece)
    flip_vertical(piece)
    assert piece.polylines[0] == poly


def test_flip_vertical_on_left_right_symmetric_shape_equals_180_rotation():
    # An isosceles trapezoid (symmetric about its vertical center line):
    # for this shape a vertical flip and a full 180 degree rotation land
    # on the same points.
    poly = [(0, 0), (20, 0), (15, 10), (5, 10), (0, 0)]
    piece = Piece(polylines=[poly], bbox=(0, 0, 20, 10))
    cx, cy = 10.0, 5.0

    flipped = Piece(polylines=[list(poly)], bbox=piece.bbox)
    flip_vertical(flipped)

    rotated_180 = [(2 * cx - x, 2 * cy - y) for x, y in poly]

    # Same shape (set of vertices) either way; which vertex ends up as the
    # closing duplicate can differ, so compare as sets, not sequences.
    assert set(flipped.polylines[0]) == set(rotated_180)


def test_rotate_90_swaps_the_bbox_dimensions():
    piece = Piece(polylines=[[(0, 0), (10, 0), (10, 4), (0, 4), (0, 0)]], bbox=(0, 0, 10, 4))
    rotate_90(piece)
    minx, miny, maxx, maxy = piece.bbox
    assert (maxx - minx, maxy - miny) == (4, 10)


def test_rotate_90_keeps_the_same_center():
    piece = Piece(polylines=[[(0, 0), (10, 0), (10, 4), (0, 4), (0, 0)]], bbox=(0, 0, 10, 4))
    rotate_90(piece)
    minx, miny, maxx, maxy = piece.bbox
    assert (minx + maxx) / 2.0 == 5.0
    assert (miny + maxy) / 2.0 == 2.0


def test_rotate_90_point_extents_match_the_new_bbox():
    poly = [(0, 0), (10, 0), (10, 4), (0, 4), (0, 0)]
    piece = Piece(polylines=[poly], bbox=(0, 0, 10, 4))
    rotate_90(piece)
    xs = [p[0] for p in piece.polylines[0]]
    ys = [p[1] for p in piece.polylines[0]]
    minx, miny, maxx, maxy = piece.bbox
    assert min(xs) == pytest.approx(minx) and max(xs) == pytest.approx(maxx)
    assert min(ys) == pytest.approx(miny) and max(ys) == pytest.approx(maxy)


def test_rotate_90_four_times_restores_the_original():
    poly = [(0, 0), (10, 0), (10, 4), (3, 4), (0, 0)]
    piece = Piece(polylines=[list(poly)], bbox=(0, 0, 10, 4))
    for _ in range(4):
        rotate_90(piece)
    for (x, y), (ox, oy) in zip(piece.polylines[0], poly):
        assert x == pytest.approx(ox)
        assert y == pytest.approx(oy)
    assert piece.bbox == pytest.approx((0, 0, 10, 4))
