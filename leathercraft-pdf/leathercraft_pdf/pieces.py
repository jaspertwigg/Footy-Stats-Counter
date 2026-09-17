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

import math
from dataclasses import dataclass
from typing import Dict, List, Tuple

from .geometry import Polyline, polyline_bbox

BBox = Tuple[float, float, float, float]


@dataclass
class Piece:
    polylines: List[Polyline]
    bbox: BBox
    cut_count: int = 1


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


def _piece_signature(piece: Piece, length_tol_mm: float) -> tuple:
    """A shape fingerprint: bbox size plus the sorted multiset of edge
    lengths, all rounded to `length_tol_mm`. Two pieces with the same
    signature are congruent -- this also matches a mirror-imaged copy to
    its original, since reflecting a shape changes neither its edge lengths
    nor its axis-aligned bounding box, and cutting a mirrored pair from one
    flipped template is standard leathercraft practice.
    """
    lengths = []
    for poly in piece.polylines:
        for (x1, y1), (x2, y2) in zip(poly, poly[1:]):
            length = math.hypot(x2 - x1, y2 - y1)
            lengths.append(round(length / length_tol_mm))
    lengths.sort()
    w = piece.bbox[2] - piece.bbox[0]
    h = piece.bbox[3] - piece.bbox[1]
    return (round(w / length_tol_mm), round(h / length_tol_mm), tuple(lengths))


def dedupe_identical_pieces(pieces: List[Piece], length_tol_mm: float = 0.1) -> List[Piece]:
    """Collapse pieces with matching geometry into one representative each.

    The representative's `cut_count` records how many copies were found, so
    the caller can print a "Cut N" label instead of drawing (and taking up
    page space for) every copy.
    """
    groups: Dict[tuple, List[Piece]] = {}
    order: List[tuple] = []
    for piece in pieces:
        sig = _piece_signature(piece, length_tol_mm)
        if sig not in groups:
            groups[sig] = []
            order.append(sig)
        groups[sig].append(piece)

    result = []
    for sig in order:
        members = groups[sig]
        rep = members[0]
        result.append(Piece(polylines=rep.polylines, bbox=rep.bbox, cut_count=len(members)))
    return result


def flip_vertical(piece: Piece) -> None:
    """Mirror a piece's geometry top-to-bottom about its own bbox center,
    in place.

    The bounding box is unchanged (flipping about its own center keeps the
    same rectangle), only the internal geometry's orientation changes --
    useful when a piece was reconstructed the way the CAD file happened to
    draw it rather than the way it should read once cut and assembled.
    """
    miny, maxy = piece.bbox[1], piece.bbox[3]
    cy = (miny + maxy) / 2.0
    piece.polylines = [[(x, 2 * cy - y) for x, y in poly] for poly in piece.polylines]


def is_irregular_shape(piece: Piece, length_tol_mm: float = 0.5) -> bool:
    """True if the piece has at least one substantial edge that's neither
    its bounding-box width nor height -- i.e. it's not a plain rectangle
    (a trapezoid, a notched/angled corner, ...).

    Short edges (under 20% of the piece's smaller bbox dimension) are
    ignored so a fold-mark tick doesn't get mistaken for an irregular main
    edge. Useful when two pieces share a bounding box but aren't the same
    shape -- e.g. picking which of two same-size pieces to `--label` as
    "the funny shaped one" without having to open the PDF first.
    """
    w = piece.bbox[2] - piece.bbox[0]
    h = piece.bbox[3] - piece.bbox[1]
    min_dim = min(w, h)
    for poly in piece.polylines:
        for (x1, y1), (x2, y2) in zip(poly, poly[1:]):
            length = math.hypot(x2 - x1, y2 - y1)
            if length < min_dim * 0.2:
                continue
            if abs(length - w) > length_tol_mm and abs(length - h) > length_tol_mm:
                return True
    return False
