"""Read a DXF file into a list of polylines, in millimetres.

DXF's Y axis already points up, the same convention used everywhere else in
this tool, so no flip is needed here (unlike SVG).
"""

from __future__ import annotations

from typing import List

from .geometry import Polyline, DEFAULT_TOLERANCE_MM

# $INSUNITS codes -> conversion factor to millimetres.
# See the DXF reference for the full table; these are the units anyone
# doing CAD pattern work is realistically going to hit.
_INSUNITS_TO_MM = {
    0: 1.0,        # Unitless -> assume mm (most hobby CAD tools default to mm)
    1: 25.4,       # Inches
    2: 304.8,      # Feet
    4: 1.0,        # Millimetres
    5: 10.0,       # Centimetres
    6: 1000.0,     # Metres
    8: 0.0254,     # Microinches (unlikely, included for completeness)
    9: 0.0254 * 1000,  # Mils
}


def read_dxf(path: str, tolerance: float = DEFAULT_TOLERANCE_MM, unit_override: float = None):
    """Returns (polylines_mm, info) where info describes the detected units."""
    import ezdxf
    from ezdxf.math import Vec2

    doc = ezdxf.readfile(path)
    msp = doc.modelspace()

    insunits = doc.header.get("$INSUNITS", 0)
    scale = unit_override if unit_override is not None else _INSUNITS_TO_MM.get(insunits, 1.0)
    assumed_mm = unit_override is None and insunits == 0

    polylines: List[Polyline] = []

    def emit(pts):
        if len(pts) >= 2:
            polylines.append([(p[0] * scale, p[1] * scale) for p in pts])

    def walk(entities):
        for e in entities:
            dxftype = e.dxftype()
            try:
                if dxftype == "INSERT":
                    # Explode block references into modelspace-transformed
                    # primitives, then recurse.
                    walk(e.virtual_entities())
                elif dxftype == "LINE":
                    emit([tuple(e.dxf.start)[:2], tuple(e.dxf.end)[:2]])
                elif dxftype in ("LWPOLYLINE", "POLYLINE"):
                    pts = [Vec2(p) for p in e.vertices_in_wcs()] if dxftype == "POLYLINE" else [
                        Vec2(p[0], p[1]) for p in e.get_points()
                    ]
                    # Flatten bulges (arc segments encoded in polylines) via
                    # ezdxf's own virtual entity explosion, which is exact.
                    walk(e.virtual_entities()) if _has_bulge(e) else emit(
                        [(p.x, p.y) for p in pts] + ([(pts[0].x, pts[0].y)] if e.is_closed else [])
                    )
                elif dxftype == "CIRCLE":
                    emit(_circle_points(e.dxf.center, e.dxf.radius))
                elif dxftype == "ARC":
                    emit(_arc_points(e.dxf.center, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle))
                elif dxftype == "ELLIPSE":
                    walk(e.virtual_entities())
                elif dxftype == "SPLINE":
                    pts = [tuple(p)[:2] for p in e.flattening(tolerance / max(scale, 1e-9))]
                    emit(pts)
                elif dxftype in ("HATCH",):
                    for path_ in e.paths:
                        walk_hatch_boundary(path_)
                # Silently skip TEXT/MTEXT/DIMENSION/etc: not cut geometry.
            except Exception:
                # One malformed entity should not take down the whole file;
                # skip it and keep going.
                continue

    def walk_hatch_boundary(path_):
        pts = [tuple(v)[:2] for v in path_.vertices] if hasattr(path_, "vertices") else []
        if pts:
            emit(pts + [pts[0]])

    def _has_bulge(lwpoly_or_poly):
        try:
            return any(b != 0 for _, _, _, _, b in lwpoly_or_poly.get_points("xyseb"))
        except Exception:
            return False

    def _circle_points(center, radius, n=None):
        import math

        n = n or max(24, int(2 * math.pi * radius / max(tolerance, 0.01)))
        cx, cy = center[0], center[1]
        pts = [
            (cx + radius * math.cos(2 * math.pi * i / n), cy + radius * math.sin(2 * math.pi * i / n))
            for i in range(n + 1)
        ]
        return pts

    def _arc_points(center, radius, start_deg, end_deg):
        import math

        cx, cy = center[0], center[1]
        start, end = math.radians(start_deg), math.radians(end_deg)
        if end <= start:
            end += 2 * math.pi
        span = end - start
        n = max(2, int(span * radius / max(tolerance, 0.01)))
        return [
            (cx + radius * math.cos(start + span * i / n), cy + radius * math.sin(start + span * i / n))
            for i in range(n + 1)
        ]

    walk(msp)

    info = {
        "source_units_code": insunits,
        "mm_per_unit": scale,
        "assumed_mm_no_units_declared": assumed_mm,
    }
    return polylines, info
