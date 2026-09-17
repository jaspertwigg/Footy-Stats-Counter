"""Flattening helpers that turn curves/arcs into short line segments.

Everything downstream (tiling, PDF drawing) only ever deals with polylines
made of straight segments, in millimetres, in a right-handed "y up" plane
(same convention as DXF and as a reportlab canvas). Keeping one internal
representation for both DXF and SVG input is what lets the rest of the
pipeline stay format-agnostic.
"""

from __future__ import annotations

import math
from typing import List, Tuple

Point = Tuple[float, float]
Polyline = List[Point]

# Flattening tolerance, in mm. 0.1mm is well below what a craft knife or a
# home printer can resolve, so it doesn't affect the "exact dimensions"
# guarantee while keeping file sizes and render time sane.
DEFAULT_TOLERANCE_MM = 0.1


def flatten_cubic_bezier(
    p0: Point, p1: Point, p2: Point, p3: Point, tolerance: float = DEFAULT_TOLERANCE_MM
) -> Polyline:
    """Adaptively subdivide a cubic Bezier into a polyline (excludes p0)."""
    pts: Polyline = []
    _subdivide_cubic(p0, p1, p2, p3, tolerance, pts, depth=0)
    pts.append(p3)
    return pts


def _subdivide_cubic(p0, p1, p2, p3, tol, out, depth):
    if depth > 24 or _cubic_is_flat(p0, p1, p2, p3, tol):
        return
    # De Casteljau split at t=0.5
    p01 = _mid(p0, p1)
    p12 = _mid(p1, p2)
    p23 = _mid(p2, p3)
    p012 = _mid(p01, p12)
    p123 = _mid(p12, p23)
    p0123 = _mid(p012, p123)
    _subdivide_cubic(p0, p01, p012, p0123, tol, out, depth + 1)
    out.append(p0123)
    _subdivide_cubic(p0123, p123, p23, p3, tol, out, depth + 1)


def _cubic_is_flat(p0, p1, p2, p3, tol) -> bool:
    d1 = _point_line_distance(p1, p0, p3)
    d2 = _point_line_distance(p2, p0, p3)
    return max(d1, d2) <= tol


def flatten_quadratic_bezier(
    p0: Point, p1: Point, p2: Point, tolerance: float = DEFAULT_TOLERANCE_MM
) -> Polyline:
    """Convert quadratic to an equivalent cubic and flatten that."""
    c1 = (p0[0] + 2.0 / 3.0 * (p1[0] - p0[0]), p0[1] + 2.0 / 3.0 * (p1[1] - p0[1]))
    c2 = (p2[0] + 2.0 / 3.0 * (p1[0] - p2[0]), p2[1] + 2.0 / 3.0 * (p1[1] - p2[1]))
    return flatten_cubic_bezier(p0, c1, c2, p2, tolerance)


def _mid(a: Point, b: Point) -> Point:
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)


def _point_line_distance(p: Point, a: Point, b: Point) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 1e-12:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    # |cross product| / |ab|
    return abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dy) / length


def flatten_svg_arc(
    x1: float,
    y1: float,
    rx: float,
    ry: float,
    x_axis_rotation_deg: float,
    large_arc_flag: bool,
    sweep_flag: bool,
    x2: float,
    y2: float,
    tolerance: float = DEFAULT_TOLERANCE_MM,
) -> Polyline:
    """SVG elliptical-arc endpoint parametrization -> polyline (excludes start point).

    Implements the standard conversion from the SVG spec (endpoint to center
    parametrization), then samples the arc finely enough that the chord
    error stays under `tolerance`.
    """
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x2, y2)]

    rx, ry = abs(rx), abs(ry)
    phi = math.radians(x_axis_rotation_deg)
    cos_phi, sin_phi = math.cos(phi), math.sin(phi)

    dx2, dy2 = (x1 - x2) / 2.0, (y1 - y2) / 2.0
    x1p = cos_phi * dx2 + sin_phi * dy2
    y1p = -sin_phi * dx2 + cos_phi * dy2

    # Correct out-of-range radii
    lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
    if lam > 1:
        scale = math.sqrt(lam)
        rx *= scale
        ry *= scale

    sign = -1.0 if large_arc_flag == sweep_flag else 1.0
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
    den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    co = sign * math.sqrt(max(num, 0.0) / den) if den > 1e-12 else 0.0
    cxp = co * (rx * y1p / ry)
    cyp = co * -(ry * x1p / rx)

    cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2.0
    cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2.0

    def angle(u, v):
        sign_ = 1.0 if u[0] * v[1] - u[1] * v[0] >= 0 else -1.0
        dot = (u[0] * v[0] + u[1] * v[1]) / (math.hypot(*u) * math.hypot(*v))
        dot = max(-1.0, min(1.0, dot))
        return sign_ * math.acos(dot)

    theta1 = angle((1, 0), ((x1p - cxp) / rx, (y1p - cyp) / ry))
    dtheta = angle(
        ((x1p - cxp) / rx, (y1p - cyp) / ry), ((-x1p - cxp) / rx, (-y1p - cyp) / ry)
    )
    if not sweep_flag and dtheta > 0:
        dtheta -= 2 * math.pi
    elif sweep_flag and dtheta < 0:
        dtheta += 2 * math.pi

    max_r = max(rx, ry)
    # Angle step such that the sagitta (max_r * (1 - cos(step/2))) <= tolerance.
    if max_r <= tolerance:
        step = abs(dtheta) or 1.0
    else:
        step = 2 * math.acos(max(0.0, 1.0 - tolerance / max_r))
        step = max(step, math.radians(1.0))
    n_steps = max(1, int(math.ceil(abs(dtheta) / step)))

    pts: Polyline = []
    for i in range(1, n_steps + 1):
        t = theta1 + dtheta * i / n_steps
        ex = cx + rx * math.cos(t) * cos_phi - ry * math.sin(t) * sin_phi
        ey = cy + rx * math.cos(t) * sin_phi + ry * math.sin(t) * cos_phi
        pts.append((ex, ey))
    pts[-1] = (x2, y2)  # avoid float drift off the exact endpoint
    return pts


def polyline_bbox(polylines: List[Polyline]):
    """Return (minx, miny, maxx, maxy) across all polylines, or None if empty."""
    minx = miny = math.inf
    maxx = maxy = -math.inf
    for poly in polylines:
        for x, y in poly:
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
    if minx is math.inf:
        return None
    return (minx, miny, maxx, maxy)


def polylines_centroid(polylines: List[Polyline]) -> Tuple[float, float]:
    """Approximate the visual center of a shape made of several polylines.

    Used to place a "Cut N" label inside a piece. Averages each polyline's
    own midpoint, then averages those -- giving a decorative sub-element
    (say, a 32-point flattened stitch-hole circle) the same weight as a
    single straight edge, rather than letting it dominate a plain point
    average just because it was sampled into more points. This isn't a
    true area centroid, but for the roughly convex outlines typical of
    leathercraft pieces it lands solidly inside the shape, which is all a
    label placement needs.
    """
    sub_centroids = []
    for poly in polylines:
        if not poly:
            continue
        sx = sum(p[0] for p in poly)
        sy = sum(p[1] for p in poly)
        sub_centroids.append((sx / len(poly), sy / len(poly)))
    if not sub_centroids:
        return (0.0, 0.0)
    cx = sum(p[0] for p in sub_centroids) / len(sub_centroids)
    cy = sum(p[1] for p in sub_centroids) / len(sub_centroids)
    return (cx, cy)
