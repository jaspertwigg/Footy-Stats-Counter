import math

from leathercraft_pdf.geometry import (
    flatten_cubic_bezier,
    flatten_quadratic_bezier,
    flatten_svg_arc,
    polyline_bbox,
)


def test_straight_cubic_collapses_to_two_points():
    # Control points collinear with the endpoints -> the curve *is* a line,
    # so flattening should need no subdivision and just return the endpoint.
    pts = flatten_cubic_bezier((0, 0), (1, 0), (2, 0), (3, 0), tolerance=0.1)
    assert pts == [(3, 0)]


def test_curved_cubic_stays_within_tolerance():
    tol = 0.05
    pts = [(0.0, 0.0)] + flatten_cubic_bezier((0, 0), (0, 10), (10, 10), (10, 0), tolerance=tol)
    # Every consecutive chord should be short enough that the true curve
    # can't have bulged more than ~tolerance away from it.
    for a, b in zip(pts, pts[1:]):
        assert math.hypot(b[0] - a[0], b[1] - a[1]) < 3.0


def test_quadratic_matches_expected_endpoint():
    pts = flatten_quadratic_bezier((0, 0), (5, 10), (10, 0), tolerance=0.05)
    assert pts[-1] == (10, 0)


def test_svg_arc_quarter_circle_radius():
    # Quarter circle of radius 10 from (10,0) to (0,10) around origin.
    pts = flatten_svg_arc(10, 0, 10, 10, 0, False, True, 0, 10, tolerance=0.05)
    assert pts[-1] == (0, 10)
    for x, y in pts:
        r = math.hypot(x, y)
        assert abs(r - 10) < 0.05 + 1e-6


def test_polyline_bbox():
    bbox = polyline_bbox([[(0, 0), (10, 5)], [(-2, 3), (4, 8)]])
    assert bbox == (-2, 0, 10, 8)


def test_polyline_bbox_empty():
    assert polyline_bbox([]) is None
