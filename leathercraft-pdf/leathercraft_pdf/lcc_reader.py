"""Read a LeathercraftCAD project file (.lcc) into a list of polylines, in mm.

.lcc is LeathercraftCAD's native save format: a JSON document with a flat
"shapes" list. There's no public format spec, so this reader only claims to
handle what's been observed in real files:

- "LINE" shapes: a straight segment from "sp" to "ep". Some LINE shapes also
  carry "bz1"/"bz2" fields that are all-zero in every sample seen so far;
  when they're non-zero we *guess* they're control-point offsets from the
  endpoints (bz1 relative to sp, bz2 relative to ep) and render a cubic
  bezier accordingly, but flag it as a guess since it's unverified.
- Units: LeathercraftCAD files seen so far have no explicit unit field, but
  edge/groove thickness values match common millimetre conventions (e.g.
  1.8mm), so coordinates are assumed to already be millimetres. Use
  --units-per-mm to override if a file turns out to be in a different unit
  -- the printed scale bar on the output PDF is the way to confirm either way.

Any shape "type" other than "LINE" is skipped and reported back in `info`
rather than silently dropped or guessed at.

LeathercraftCAD also lets a project define named "layers" (a top-level
"layers" list with "id"/"nam") and puts each shape on one via its own
"layer" field -- a project organised that way (e.g. a "Hidden Pockets"
layer) hands us a piece's real name for free, instead of us having to
guess it from geometry or a user re-typing it with --label. A layer left
at its LeathercraftCAD-assigned default ("Layer N") carries no real
information, so it's reported as None rather than as that placeholder.
"""

from __future__ import annotations

import json
import re
from typing import List, Optional

from .geometry import Polyline, flatten_cubic_bezier, DEFAULT_TOLERANCE_MM


def _default_layer_name(layer_id, name: str) -> bool:
    """True if `name` looks like LeathercraftCAD's own auto-assigned
    "Layer N" placeholder for this id, rather than something the user typed.
    """
    return bool(re.fullmatch(r"Layer \d+", name)) and name == f"Layer {int(layer_id) + 1}"


def read_lcc(path: str, tolerance: float = DEFAULT_TOLERANCE_MM, unit_override: float = None):
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)

    scale = unit_override if unit_override is not None else 1.0
    assumed_mm = unit_override is None

    layer_names_by_id = {}
    for layer in data.get("layers", []):
        name = layer.get("nam", "")
        if name and not _default_layer_name(layer.get("id", 0), name):
            layer_names_by_id[str(layer.get("id"))] = name

    polylines: List[Polyline] = []
    layer_names: List[Optional[str]] = []
    skipped_types = {}
    guessed_curves = 0

    for shape in data.get("shapes", []):
        shape_type = shape.get("type")
        if shape_type != "LINE":
            skipped_types[shape_type] = skipped_types.get(shape_type, 0) + 1
            continue

        sp, ep = shape.get("sp"), shape.get("ep")
        if not sp or not ep:
            continue
        bz1 = shape.get("bz1") or [0, 0]
        bz2 = shape.get("bz2") or [0, 0]

        if bz1 == [0, 0] and bz2 == [0, 0]:
            pts = [tuple(sp), tuple(ep)]
        else:
            guessed_curves += 1
            p0 = tuple(sp)
            p1 = (sp[0] + bz1[0], sp[1] + bz1[1])
            p2 = (ep[0] + bz2[0], ep[1] + bz2[1])
            p3 = tuple(ep)
            pts = [p0] + flatten_cubic_bezier(p0, p1, p2, p3, tolerance / max(scale, 1e-9))

        polylines.append([(x * scale, y * scale) for x, y in pts])
        layer_names.append(layer_names_by_id.get(str(shape.get("layer"))))

    info = {
        "assumed_mm_no_units_declared": assumed_mm,
        "mm_per_unit": scale,
        "skipped_shape_types": skipped_types,
        "guessed_curve_count": guessed_curves,
        "layer_names": layer_names,
    }
    return polylines, info
