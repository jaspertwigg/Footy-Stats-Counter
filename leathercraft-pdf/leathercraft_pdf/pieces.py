"""Group flattened polylines into individual pattern pieces.

Neither DXF nor SVG nor .lcc reliably tells us "these lines are one cuttable
piece" -- a CAD file is just a pile of geometry laid out on a canvas. That
grouping matters a lot for tiling: without it, tiling has to treat the
*entire* canvas as one solid block and lay a rigid page grid over it, which
can slice a small piece in half for no reason other than where it happens
to sit relative to other, unrelated pieces on a sparse layout.

This reconstructs pieces the same way a person would look at the drawing:
lines that touch at their endpoints are obviously part of the same shape
(an outline plus its fold-mark ticks, say), and a small closed shape sitting
entirely inside another one's outline (a stitch hole, a punch mark) belongs
to that outline even though it doesn't touch it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from .geometry import Polyline, polyline_bbox

BBox = Tuple[float, float, float, float]


@dataclass
class Piece:
    polylines: List[Polyline]
    bbox: BBox


class _UnionFind:
    def __init__(self):
        self.parent = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def _endpoint_key(pt, epsilon):
    return (round(pt[0] / epsilon), round(pt[1] / epsilon))


def _bbox_contains(outer: BBox, inner: BBox, tol: float) -> bool:
    return (
        outer[0] - tol <= inner[0]
        and outer[1] - tol <= inner[1]
        and outer[2] + tol >= inner[2]
        and outer[3] + tol >= inner[3]
    )


def group_into_pieces(
    polylines: List[Polyline],
    endpoint_epsilon_mm: float = 0.05,
    containment_tolerance_mm: float = 0.5,
) -> List[Piece]:
    """Reconstruct pattern pieces from a flat list of polylines.

    Two lines are joined into the same piece if either:
    1. They share an endpoint (within `endpoint_epsilon_mm`) -- this chains
       separate LINE segments (as .lcc stores them) back into outlines, and
       pulls in things like fold-mark ticks that touch the outline.
    2. One's bounding box is fully contained within another's (within
       `containment_tolerance_mm`) -- this catches decorative elements that
       don't touch the outline at all, like a stitch-hole circle drawn
       entirely inside a piece.

    Two lines that are merely close together but don't satisfy either of
    those (e.g. two separate pieces nested for efficient cutting, sitting
    edge-to-edge) are correctly kept as separate pieces.
    """
    n = len(polylines)
    uf = _UnionFind()
    for i in range(n):
        uf.find(i)

    # Pass 1: connect polylines that share an endpoint.
    endpoint_to_indices = {}
    for i, poly in enumerate(polylines):
        if len(poly) < 1:
            continue
        for pt in (poly[0], poly[-1]):
            endpoint_to_indices.setdefault(_endpoint_key(pt, endpoint_epsilon_mm), []).append(i)

    for indices in endpoint_to_indices.values():
        for other in indices[1:]:
            uf.union(indices[0], other)

    # Pass 2: merge components whose *combined* bounding boxes contain one
    # another (e.g. a decorative hole sitting entirely inside an outline it
    # never touches). This has to operate on whole-component boxes, not
    # individual polyline boxes: a single straight line has a degenerate,
    # near-zero-area box, so comparing those directly would flag any two
    # merely-nearby lines as "contained" in each other. Repeats to a fixed
    # point since a merge can change a component's box enough to trigger
    # another.
    changed = True
    while changed:
        changed = False
        roots = {}
        for i in range(n):
            roots.setdefault(uf.find(i), []).append(i)
        root_bbox = {root: polyline_bbox([polylines[i] for i in idxs]) for root, idxs in roots.items()}
        root_items = list(root_bbox.items())
        for a in range(len(root_items)):
            ra, ba = root_items[a]
            if ba is None:
                continue
            for b in range(a + 1, len(root_items)):
                rb, bb = root_items[b]
                if bb is None or uf.find(ra) == uf.find(rb):
                    continue
                if _bbox_contains(ba, bb, containment_tolerance_mm) or _bbox_contains(
                    bb, ba, containment_tolerance_mm
                ):
                    uf.union(ra, rb)
                    changed = True

    groups = {}
    for i in range(n):
        groups.setdefault(uf.find(i), []).append(i)

    pieces = []
    for indices in groups.values():
        member_polylines = [polylines[i] for i in indices]
        bbox = polyline_bbox(member_polylines)
        if bbox is None:
            continue
        pieces.append(Piece(polylines=member_polylines, bbox=bbox))
    return pieces
