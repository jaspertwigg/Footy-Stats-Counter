"""Decide which pieces can share pages whole, and which genuinely need tiling.

A piece is only ever split across pages if it literally cannot fit on one
page at true scale -- never because of where it happened to sit relative to
other pieces on the original CAD canvas. Pieces are placed by simple
shelf-packing (like packing boxes into rows); they are never rotated, since
leather has a grain direction and a pattern piece's orientation on the hide
usually matters.

Two more preferences shape the page order:

- The largest pieces get a page to themselves. A big piece (say, the main
  body panel) sharing a page with several small ones tends to look
  cluttered and makes it easy to grab the wrong page's piece by mistake, so
  the biggest few are isolated even when there'd technically be room to
  cram something else in beside them.
- Everything else is grouped by how similar its size is, so a page tends to
  hold "the four card-slot pieces" rather than an arbitrary mix -- easier
  to recognise pages by their contents at a glance.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from .pieces import Piece

Placement = Tuple[Piece, float, float]  # piece, x-offset mm, y-offset mm to page-local space

SOLO_LARGEST_COUNT = 2
SIMILAR_SIZE_TOLERANCE_MM = 8.0


@dataclass
class PackedPage:
    placements: List[Placement]


def _dims(piece: Piece) -> Tuple[float, float]:
    minx, miny, maxx, maxy = piece.bbox
    return maxx - minx, maxy - miny


def _area(piece: Piece) -> float:
    w, h = _dims(piece)
    return w * h


def _group_by_similar_size(pieces: List[Piece], tolerance_mm: float) -> List[Piece]:
    """Cluster pieces with close-to-matching (width, height), largest cluster
    first, and return them concatenated -- so a shelf packer processing them
    in this order naturally tends to put a whole cluster on the same page(s)
    before moving on to the next size.
    """
    clusters: List[Tuple[float, float, List[Piece]]] = []
    for piece in sorted(pieces, key=lambda p: -_area(p)):
        w, h = _dims(piece)
        for i, (rep_w, rep_h, members) in enumerate(clusters):
            if abs(w - rep_w) <= tolerance_mm and abs(h - rep_h) <= tolerance_mm:
                members.append(piece)
                break
        else:
            clusters.append((w, h, [piece]))

    clusters.sort(key=lambda c: -(c[0] * c[1]))
    return [piece for _, _, members in clusters for piece in members]


def pack_pieces(
    pieces: List[Piece],
    page_size_mm: Tuple[float, float],
    margin_mm: float,
    spacing_mm: float = 6.0,
    solo_largest_count: int = SOLO_LARGEST_COUNT,
    similarity_tolerance_mm: float = SIMILAR_SIZE_TOLERANCE_MM,
) -> Tuple[List[PackedPage], List[Piece]]:
    """Returns (packed_pages, oversized_pieces).

    `oversized_pieces` didn't fit the printable area in at least one
    dimension and need to be tiled individually by the caller.
    """
    printable_w = page_size_mm[0] - 2 * margin_mm
    printable_h = page_size_mm[1] - 2 * margin_mm

    fits: List[Piece] = []
    oversized: List[Piece] = []
    for piece in pieces:
        w, h = _dims(piece)
        if w <= printable_w and h <= printable_h:
            fits.append(piece)
        else:
            oversized.append(piece)

    by_area_desc = sorted(fits, key=lambda p: -_area(p))
    solo = by_area_desc[:solo_largest_count]
    remaining = _group_by_similar_size(by_area_desc[solo_largest_count:], similarity_tolerance_mm)

    pages: List[PackedPage] = []
    for piece in solo:
        minx, miny, _, _ = piece.bbox
        pages.append(PackedPage(placements=[(piece, -minx, -miny)]))

    current: List[Placement] = []
    cursor_x = 0.0
    shelf_y = 0.0
    shelf_h = 0.0

    def start_new_page():
        nonlocal current, cursor_x, shelf_y, shelf_h
        if current:
            pages.append(PackedPage(placements=current))
        current = []
        cursor_x = 0.0
        shelf_y = 0.0
        shelf_h = 0.0

    for piece in remaining:
        minx, miny, maxx, maxy = piece.bbox
        w, h = maxx - minx, maxy - miny

        if cursor_x > 0 and cursor_x + w > printable_w:
            shelf_y += shelf_h + spacing_mm
            shelf_h = 0.0
            cursor_x = 0.0

        if shelf_y + h > printable_h:
            start_new_page()
            # A piece in `fits` is guaranteed h <= printable_h, so it's
            # guaranteed to fit on this fresh, empty page.

        offset_x = cursor_x - minx
        offset_y = shelf_y - miny
        current.append((piece, offset_x, offset_y))

        cursor_x += w + spacing_mm
        shelf_h = max(shelf_h, h)

    if current:
        pages.append(PackedPage(placements=current))

    return pages, oversized
