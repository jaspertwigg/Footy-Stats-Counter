"""Work out how to split a pattern's bounding box across pages.

Tiles overlap by `overlap_mm` on interior edges so adjacent pages share a
strip of identical artwork (and identical registration crosshairs) that
lines up when cut and taped together at true scale.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

PAGE_SIZES_MM = {
    "A4": (210.0, 297.0),
    "LETTER": (215.9, 279.4),
    "A3": (297.0, 420.0),
}


@dataclass(frozen=True)
class Tile:
    row: int
    col: int
    rows: int
    cols: int
    # Bounding rect of this tile in pattern-space mm (x0, y0, x1, y1),
    # already extended by the overlap on interior edges.
    rect: Tuple[float, float, float, float]


def _axis_starts(total: float, printable: float, overlap: float) -> List[float]:
    """Starting offsets (mm, from 0) for tiles covering `total` length."""
    if total <= printable:
        return [0.0]
    step = printable - overlap
    if step <= 0:
        raise ValueError(
            "overlap_mm must be smaller than the printable page dimension "
            f"(printable={printable}mm, overlap={overlap}mm)"
        )
    starts = [0.0]
    while starts[-1] + printable < total:
        starts.append(starts[-1] + step)
    # Pull the last tile back so it ends exactly on the pattern edge, no
    # trailing wasted/empty page.
    if starts[-1] + printable > total:
        starts[-1] = max(0.0, total - printable)
    return starts


def compute_tiles(
    bbox_mm: Tuple[float, float, float, float],
    page_size_mm: Tuple[float, float],
    margin_mm: float,
    overlap_mm: float,
) -> List[Tile]:
    minx, miny, maxx, maxy = bbox_mm
    width, height = maxx - minx, maxy - miny
    page_w, page_h = page_size_mm
    printable_w = page_w - 2 * margin_mm
    printable_h = page_h - 2 * margin_mm
    if printable_w <= 0 or printable_h <= 0:
        raise ValueError("margin_mm too large for the chosen page size")

    x_starts = _axis_starts(width, printable_w, overlap_mm)
    y_starts = _axis_starts(height, printable_h, overlap_mm)

    cols, rows = len(x_starts), len(y_starts)
    tiles: List[Tile] = []
    # Row 0 = top of the pattern, matching reading order on a taped-up sheet.
    for row, y_off in enumerate(reversed(y_starts)):
        for col, x_off in enumerate(x_starts):
            x0 = minx + x_off
            x1 = min(maxx, x0 + printable_w)
            y1 = maxy - y_off
            y0 = max(miny, y1 - printable_h)
            tiles.append(Tile(row=row, col=col, rows=rows, cols=cols, rect=(x0, y0, x1, y1)))
    return tiles


def needs_tiling(bbox_mm, page_size_mm, margin_mm) -> bool:
    minx, miny, maxx, maxy = bbox_mm
    printable_w = page_size_mm[0] - 2 * margin_mm
    printable_h = page_size_mm[1] - 2 * margin_mm
    return (maxx - minx) > printable_w + 1e-6 or (maxy - miny) > printable_h + 1e-6
