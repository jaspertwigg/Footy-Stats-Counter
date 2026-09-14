"""Read an SVG file into a list of polylines, in millimetres.

SVG's Y axis points down and its length units are ambiguous (a bare number
is "user units", which only maps to a physical size via the document's
width/height/viewBox, or a DPI guess if even that is missing). Both of
those are handled here so the rest of the pipeline can work in plain,
y-up millimetres like everything else.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import List, Optional, Tuple

from .geometry import (
    Polyline,
    DEFAULT_TOLERANCE_MM,
    flatten_cubic_bezier,
    flatten_quadratic_bezier,
    flatten_svg_arc,
)

Matrix = Tuple[float, float, float, float, float, float]  # a b c d e f (SVG matrix order)

IDENTITY: Matrix = (1, 0, 0, 1, 0, 0)

_UNIT_TO_MM = {
    "mm": 1.0,
    "cm": 10.0,
    "in": 25.4,
    "pt": 25.4 / 72.0,
    "pc": 25.4 / 6.0,
    "px": None,  # resolved via dpi
    "": None,  # unitless: same as px
}


def mat_mul(m1: Matrix, m2: Matrix) -> Matrix:
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def apply_matrix(m: Matrix, x: float, y: float) -> Tuple[float, float]:
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def parse_transform(s: Optional[str]) -> Matrix:
    if not s:
        return IDENTITY
    m = IDENTITY
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", s):
        nums = [float(v) for v in re.findall(r"-?[\d.eE+-]+", args)]
        if name == "translate":
            tx = nums[0]
            ty = nums[1] if len(nums) > 1 else 0.0
            m = mat_mul(m, (1, 0, 0, 1, tx, ty))
        elif name == "scale":
            sx = nums[0]
            sy = nums[1] if len(nums) > 1 else sx
            m = mat_mul(m, (sx, 0, 0, sy, 0, 0))
        elif name == "rotate":
            import math

            ang = math.radians(nums[0])
            cos_a, sin_a = math.cos(ang), math.sin(ang)
            if len(nums) >= 3:
                cx, cy = nums[1], nums[2]
                m = mat_mul(m, (1, 0, 0, 1, cx, cy))
                m = mat_mul(m, (cos_a, sin_a, -sin_a, cos_a, 0, 0))
                m = mat_mul(m, (1, 0, 0, 1, -cx, -cy))
            else:
                m = mat_mul(m, (cos_a, sin_a, -sin_a, cos_a, 0, 0))
        elif name == "matrix":
            m = mat_mul(m, tuple(nums[:6]))
        elif name == "skewX":
            import math

            m = mat_mul(m, (1, 0, math.tan(math.radians(nums[0])), 1, 0, 0))
        elif name == "skewY":
            import math

            m = mat_mul(m, (1, math.tan(math.radians(nums[0])), 0, 1, 0, 0))
    return m


_LEN_RE = re.compile(r"^\s*(-?[\d.eE+-]+)\s*([a-zA-Z%]*)\s*$")


def _parse_length(s: str) -> Tuple[float, str]:
    m = _LEN_RE.match(s)
    if not m:
        raise ValueError(f"Unparseable length: {s!r}")
    return float(m.group(1)), m.group(2).lower()


def detect_mm_per_user_unit(root: ET.Element, dpi: float, scale_override: Optional[float]):
    """Figure out how many millimetres one SVG user-unit is.

    Priority: explicit --scale override > width/height with a real physical
    unit (mm/cm/in/pt/pc) combined with viewBox > width/height in px or
    unitless, combined with the given/assumed dpi.
    """
    if scale_override is not None:
        return scale_override, "explicit --scale override", False

    width_attr = root.get("width")
    height_attr = root.get("height")
    viewbox = root.get("viewBox")
    vb_w = vb_h = None
    if viewbox:
        parts = re.findall(r"-?[\d.eE+-]+", viewbox)
        if len(parts) == 4:
            vb_w, vb_h = float(parts[2]), float(parts[3])

    # Prefer width, fall back to height if width is missing/unparseable --
    # either one pins the scale as long as we're consistent about which
    # viewBox dimension we divide by.
    for attr_name, attr_val, vb_dim in (("width", width_attr, vb_w), ("height", height_attr, vb_h)):
        if not attr_val:
            continue
        try:
            value, unit = _parse_length(attr_val)
        except ValueError:
            continue
        if not value:
            continue
        if unit in _UNIT_TO_MM and _UNIT_TO_MM[unit] is not None:
            mm_size = value * _UNIT_TO_MM[unit]
            user_size = vb_dim if vb_dim else value
            return mm_size / user_size, f"document {attr_name}={attr_val!r}", False
        if unit in ("px", ""):
            mm_per_px = 25.4 / dpi
            # The attribute is itself in user units when a viewBox scales it;
            # otherwise 1 user unit == 1 px.
            if vb_dim:
                return (value * mm_per_px) / vb_dim, f"px {attr_name} scaled via viewBox, dpi={dpi}", True
            return mm_per_px, f"px {attr_name}, dpi={dpi} assumed", True

    # No usable width/height: assume 1 user unit = 1px at the given dpi.
    return 25.4 / dpi, f"no physical size found, assuming dpi={dpi}", True


def _tokenize_path(d: str):
    return re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|-?[\d.]+(?:[eE][+-]?\d+)?", d)


def parse_path_d(d: str, tolerance: float) -> List[Polyline]:
    """Parse an SVG path 'd' attribute into a list of polylines (subpaths)."""
    tokens = _tokenize_path(d)
    i = 0
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    last_cubic_ctrl: Optional[Tuple[float, float]] = None
    last_quad_ctrl: Optional[Tuple[float, float]] = None
    subpaths: List[Polyline] = []
    current: Polyline = []
    cmd = None

    def read_nums(n):
        nonlocal i
        vals = [float(tokens[i + k]) for k in range(n)]
        i += n
        return vals

    while i < len(tokens):
        tok = tokens[i]
        if re.match(r"^[A-Za-z]$", tok):
            cmd = tok
            i += 1
        # else: repeated implicit command, reuse `cmd`

        is_rel = cmd is not None and cmd.islower()
        c = cmd.upper() if cmd else None

        if c == "M":
            x, y = read_nums(2)
            if is_rel:
                x, y = cur[0] + x, cur[1] + y
            if current:
                subpaths.append(current)
            current = [(x, y)]
            cur = (x, y)
            start = cur
            cmd = "l" if is_rel else "L"  # subsequent pairs are implicit lineto
        elif c == "L":
            x, y = read_nums(2)
            if is_rel:
                x, y = cur[0] + x, cur[1] + y
            current.append((x, y))
            cur = (x, y)
        elif c == "H":
            (x,) = read_nums(1)
            if is_rel:
                x = cur[0] + x
            cur = (x, cur[1])
            current.append(cur)
        elif c == "V":
            (y,) = read_nums(1)
            if is_rel:
                y = cur[1] + y
            cur = (cur[0], y)
            current.append(cur)
        elif c == "C":
            x1, y1, x2, y2, x, y = read_nums(6)
            if is_rel:
                x1, y1 = cur[0] + x1, cur[1] + y1
                x2, y2 = cur[0] + x2, cur[1] + y2
                x, y = cur[0] + x, cur[1] + y
            current.extend(flatten_cubic_bezier(cur, (x1, y1), (x2, y2), (x, y), tolerance))
            last_cubic_ctrl = (x2, y2)
            cur = (x, y)
        elif c == "S":
            x2, y2, x, y = read_nums(4)
            if is_rel:
                x2, y2 = cur[0] + x2, cur[1] + y2
                x, y = cur[0] + x, cur[1] + y
            if last_cubic_ctrl:
                x1, y1 = 2 * cur[0] - last_cubic_ctrl[0], 2 * cur[1] - last_cubic_ctrl[1]
            else:
                x1, y1 = cur
            current.extend(flatten_cubic_bezier(cur, (x1, y1), (x2, y2), (x, y), tolerance))
            last_cubic_ctrl = (x2, y2)
            cur = (x, y)
        elif c == "Q":
            x1, y1, x, y = read_nums(4)
            if is_rel:
                x1, y1 = cur[0] + x1, cur[1] + y1
                x, y = cur[0] + x, cur[1] + y
            current.extend(flatten_quadratic_bezier(cur, (x1, y1), (x, y), tolerance))
            last_quad_ctrl = (x1, y1)
            cur = (x, y)
        elif c == "T":
            x, y = read_nums(2)
            if is_rel:
                x, y = cur[0] + x, cur[1] + y
            if last_quad_ctrl:
                x1, y1 = 2 * cur[0] - last_quad_ctrl[0], 2 * cur[1] - last_quad_ctrl[1]
            else:
                x1, y1 = cur
            current.extend(flatten_quadratic_bezier(cur, (x1, y1), (x, y), tolerance))
            last_quad_ctrl = (x1, y1)
            cur = (x, y)
        elif c == "A":
            rx, ry, rot, large, sweep, x, y = read_nums(7)
            if is_rel:
                x, y = cur[0] + x, cur[1] + y
            current.extend(
                flatten_svg_arc(cur[0], cur[1], rx, ry, rot, bool(large), bool(sweep), x, y, tolerance)
            )
            cur = (x, y)
        elif c == "Z":
            current.append(start)
            cur = start
        else:
            i += 1  # skip anything unrecognized rather than looping forever
            continue

        if c not in ("C", "S"):
            last_cubic_ctrl = None
        if c not in ("Q", "T"):
            last_quad_ctrl = None

    if current:
        subpaths.append(current)
    return subpaths


_NS = "{http://www.w3.org/2000/svg}"


def _tag(el: ET.Element) -> str:
    t = el.tag
    return t.split("}", 1)[1] if "}" in t else t


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def read_svg(path: str, tolerance: float = DEFAULT_TOLERANCE_MM, dpi: float = 96.0, scale_override: float = None):
    tree = ET.parse(path)
    root = tree.getroot()

    mm_per_unit, method, is_guess = detect_mm_per_user_unit(root, dpi, scale_override)

    raw_polylines: List[Polyline] = []  # in user units, y-down, pre-mm-scale

    def walk(el: ET.Element, parent_m: Matrix):
        tag = _tag(el)
        m = mat_mul(parent_m, parse_transform(el.get("transform")))

        if tag in ("g", "svg", "a"):
            for child in el:
                walk(child, m)
            return

        if tag == "path":
            d = el.get("d")
            if d:
                for sub in parse_path_d(d, tolerance / max(mm_per_unit, 1e-9)):
                    raw_polylines.append([apply_matrix(m, x, y) for x, y in sub])
        elif tag == "line":
            x1, y1 = _num(el.get("x1")), _num(el.get("y1"))
            x2, y2 = _num(el.get("x2")), _num(el.get("y2"))
            raw_polylines.append([apply_matrix(m, x1, y1), apply_matrix(m, x2, y2)])
        elif tag in ("polyline", "polygon"):
            pts_str = el.get("points", "")
            nums = [float(v) for v in re.findall(r"-?[\d.eE+-]+", pts_str)]
            pts = list(zip(nums[0::2], nums[1::2]))
            if tag == "polygon" and pts:
                pts.append(pts[0])
            if len(pts) >= 2:
                raw_polylines.append([apply_matrix(m, x, y) for x, y in pts])
        elif tag == "rect":
            x, y = _num(el.get("x")), _num(el.get("y"))
            w, h = _num(el.get("width")), _num(el.get("height"))
            if w > 0 and h > 0:
                corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
                raw_polylines.append([apply_matrix(m, cx, cy) for cx, cy in corners])
        elif tag == "circle":
            cx, cy, r = _num(el.get("cx")), _num(el.get("cy")), _num(el.get("r"))
            if r > 0:
                raw_polylines.append(
                    [apply_matrix(m, *pt) for pt in _ellipse_points(cx, cy, r, r, tolerance / max(mm_per_unit, 1e-9))]
                )
        elif tag == "ellipse":
            cx, cy = _num(el.get("cx")), _num(el.get("cy"))
            rx, ry = _num(el.get("rx")), _num(el.get("ry"))
            if rx > 0 and ry > 0:
                raw_polylines.append(
                    [apply_matrix(m, *pt) for pt in _ellipse_points(cx, cy, rx, ry, tolerance / max(mm_per_unit, 1e-9))]
                )
        # Anything else (text, image, use, defs, style, ...) is not cut geometry.

    walk(root, IDENTITY)

    # Convert to mm and flip Y so the whole pipeline can treat this exactly
    # like DXF's native y-up, millimetre space.
    polylines_mm: List[Polyline] = [
        [(x * mm_per_unit, -y * mm_per_unit) for x, y in poly] for poly in raw_polylines
    ]

    info = {
        "mm_per_user_unit": mm_per_unit,
        "detection_method": method,
        "is_guess": is_guess,
        "dpi_used": dpi,
    }
    return polylines_mm, info


def _ellipse_points(cx, cy, rx, ry, tolerance):
    import math

    max_r = max(rx, ry)
    step = 2 * math.acos(max(0.0, 1.0 - tolerance / max_r)) if max_r > tolerance else 2 * math.pi
    step = max(step, math.radians(2.0))
    n = max(16, int(math.ceil(2 * math.pi / step)))
    return [
        (cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n))
        for i in range(n + 1)
    ]
