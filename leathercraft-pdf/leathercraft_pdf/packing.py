"""Decide which pieces can share pages whole, and which genuinely need tiling.

A piece is only ever split across pages if it literally cannot fit on one
page at true scale -- never because of where it happened to sit relative to
other pieces on the original CAD canvas. Pieces are placed by simple
shelf-packing (like packing boxes into rows); they are never rotated, since
leather has a grain direction and a pattern piece's orientation on the hide
usually matters.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from .pieces import Piece

Placement = Tuple[Piece, float, float]  # piece, x-offset mm, y-offset mm to page-local space


@dataclass
class PackedPage:
    placements: List[Placement]


def pack_pieces(
    pieces: List[Piece],
    page_size_mm: Tuple[float, float],
    margin_mm: float,
    spacing_mm: float = 6.0,
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
        minx, miny, maxx, maxy = piece.bbox
        w, h = maxx - minx, maxy - miny
        if w <= printable_w and h <= printable_h:
            fits.append(piece)
        else:
            oversized.append(piece)

    # Tallest-first is a simple, effective heuristic for shelf packing.
    fits.sort(key=lambda p: -(p.bbox[3] - p.bbox[1]))

    pages: List[PackedPage] = []
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

    for piece in fits:
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
