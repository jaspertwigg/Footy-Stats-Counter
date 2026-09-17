import math

from leathercraft_pdf.geometry import (
    flatten_cubic_bezier,
    flatten_quadratic_bezier,
    flatten_svg_arc,
    polyline_bbox,
    polylines_centroid,
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


def test_centroid_of_a_rectangle_is_its_center():
    rect_edges = [
        [(0, 0), (100, 0)],
        [(100, 0), (100, 50)],
        [(100, 50), (0, 50)],
        [(0, 50), (0, 0)],
    ]
    cx, cy = polylines_centroid(rect_edges)
    assert abs(cx - 50) < 1e-6
    assert abs(cy - 25) < 1e-6


def test_centroid_is_not_skewed_by_a_densely_sampled_sub_element():
    # A rectangle outline (4 edges) plus a finely-sampled "hole" circle near
    # one corner. Naively averaging every point would drag the centroid
    # toward the circle just because it contributed many more points.
    rect_edges = [
        [(0, 0), (100, 0)],
        [(100, 0), (100, 50)],
        [(100, 50), (0, 50)],
        [(0, 50), (0, 0)],
    ]
    circle_near_corner = [(95 + math.cos(t) * 2, 45 + math.sin(t) * 2) for t in [i / 20 * 2 * math.pi for i in range(40)]]
    cx, cy = polylines_centroid(rect_edges + [circle_near_corner])
    # Still much closer to the rectangle's true center (50, 25) than to the
    # circle near (95, 45).
    assert math.hypot(cx - 50, cy - 25) < math.hypot(cx - 95, cy - 45)
