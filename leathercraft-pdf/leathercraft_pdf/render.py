"""Draw the packed/tiled pattern pages to a PDF using reportlab.

The core guarantee this file has to uphold: 1mm of pattern geometry becomes
exactly 1mm on the printed page. reportlab's canvas is unitless "points"
(1/72 inch), so every coordinate that reaches the canvas goes through
MM_TO_PT and nothing else touches scale. No "fit to page" logic exists
here on purpose -- a piece that doesn't fit gets tiled instead of shrunk.

Two kinds of pages come out of the pipeline (see cli.py / packing.py):

- A "packed" page holds one or more whole pieces, each placed as a rigid,
  unrotated block -- nothing on a packed page is ever cut across a page
  boundary.
- A "tile" page is one page of a piece that's genuinely too big for a
  single sheet, carrying registration crosshairs so it can be taped back
  together with its sibling pages at true scale.
"""

from __future__ import annotations

import datetime
import os
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from reportlab.pdfgen import canvas as rl_canvas

from .geometry import Polyline
from .layout import Tile

MM_TO_PT = 72.0 / 25.4

REG_GRID_SPACING_MM = 50.0
REG_MARK_SIZE_MM = 3.0
LINE_WIDTH_MM = 0.15
CUT_LABEL_FONT_SIZE = 14
SHAPE_LABEL_FONT_SIZE = 8  # when shown alongside a cut label -- deliberately smaller
SHAPE_LABEL_ALONE_FONT_SIZE = 11  # when it's the only text on the piece
SCALE_BAR_WIDTH_CM = 5.0
SCALE_BAR_HEIGHT_CM = 3.0


@dataclass
class PiecePlacement:
    polylines: List[Polyline]
    offset_x: float
    offset_y: float
    footer_label: str
    # Set only for a deduped piece with more than one copy, e.g. "Cut 2".
    cut_label: Optional[str] = None
    # A user-supplied name for this piece (--label), e.g. "Outer Shell".
    # Drawn smaller than cut_label so the cut count stays the more
    # prominent, actionable text.
    shape_label: Optional[str] = None
    # Pattern-space (px, py), before offset_x/offset_y -- where to center
    # cut_label/shape_label, if either is set.
    centroid: Optional[Tuple[float, float]] = None


@dataclass
class PackedPageJob:
    placements: List[PiecePlacement] = field(default_factory=list)


@dataclass
class TilePageJob:
    polylines: List[Polyline]
    tile: Tile
    piece_label: str
    # Only set on the one tile page that "owns" showing this piece's cut
    # and/or shape label (its centroid falls within that tile's rect).
    cut_label: Optional[str] = None
    shape_label: Optional[str] = None
    cut_centroid: Optional[Tuple[float, float]] = None


def _mm(v: float) -> float:
    return v * MM_TO_PT


def draw_pdf(
    output_path: str,
    pages: List,  # list of PackedPageJob | TilePageJob, in the order they should be printed
    page_size_mm: Tuple[float, float],
    margin_mm: float,
    source_name: str,
    unit_note: str,
):
    page_w, page_h = page_size_mm
    c = rl_canvas.Canvas(output_path, pagesize=(_mm(page_w), _mm(page_h)))
    total = len(pages)

    for idx, page in enumerate(pages, start=1):
        if isinstance(page, TilePageJob):
            _draw_tile_page(c, page, idx, total, page_size_mm, margin_mm, source_name, unit_note)
        else:
            _draw_packed_page(c, page, idx, total, page_size_mm, margin_mm, source_name, unit_note)
        c.showPage()

    c.save()


def _stroke_polylines(c, to_page, polylines, clip_rect):
    cx0, cy0, cx1, cy1 = clip_rect
    c.setLineWidth(_mm(LINE_WIDTH_MM))
    c.setStrokeColorRGB(0, 0, 0)
    for poly in polylines:
        if len(poly) < 2:
            continue
        path = c.beginPath()
        px, py = to_page(*poly[0])
        path.moveTo(_mm(px), _mm(py))
        for x, y in poly[1:]:
            px, py = to_page(x, y)
            path.lineTo(_mm(px), _mm(py))
        c.drawPath(path, stroke=1, fill=0)


def _draw_tile_page(c, job: TilePageJob, page_num, total_pages, page_size_mm, margin_mm, source_name, unit_note):
    page_w, page_h = page_size_mm
    tile = job.tile
    x0, y0, x1, y1 = tile.rect
    tile_w, tile_h = x1 - x0, y1 - y0

    def to_page(px, py):
        """pattern-space mm -> page-space mm (origin bottom-left of the page)."""
        return (margin_mm + (px - x0), margin_mm + (py - y0))

    c.saveState()

    # --- Clip to the printable tile rect and draw the actual pattern lines ---
    c.saveState()
    clip = c.beginPath()
    clip.rect(_mm(margin_mm), _mm(margin_mm), _mm(tile_w), _mm(tile_h))
    c.clipPath(clip, stroke=0, fill=0)

    visible = [poly for poly in job.polylines if _overlaps(poly, x0, y0, x1, y1)]
    _stroke_polylines(c, to_page, visible, (margin_mm, margin_mm, margin_mm + tile_w, margin_mm + tile_h))
    _draw_registration_grid(c, to_page, x0, y0, x1, y1)
    if job.cut_centroid and (job.cut_label or job.shape_label):
        cx, cy = to_page(*job.cut_centroid)
        _draw_piece_labels(c, cx, cy, job.shape_label, job.cut_label)
    c.restoreState()

    # --- Page furniture: crop marks, scale bar, footer, overview (unclipped) ---
    _draw_crop_marks(c, page_w, page_h, margin_mm)
    _draw_scale_bar(c, margin_mm)
    label = (
        f"{job.piece_label}  |  page {page_num}/{total_pages}  "
        f"(tile row {tile.row + 1}/{tile.rows}, col {tile.col + 1}/{tile.cols})  "
        f"-- TILED: tape to its sibling pages using the crosshairs, verify the scale bar first"
    )
    _draw_footer(c, label, page_w, margin_mm, source_name, unit_note)
    _draw_overview(c, tile, page_w, page_h, margin_mm)

    c.restoreState()


def _draw_packed_page(c, job: PackedPageJob, page_num, total_pages, page_size_mm, margin_mm, source_name, unit_note):
    page_w, page_h = page_size_mm
    printable_w, printable_h = page_w - 2 * margin_mm, page_h - 2 * margin_mm

    c.saveState()
    c.saveState()
    clip = c.beginPath()
    clip.rect(_mm(margin_mm), _mm(margin_mm), _mm(printable_w), _mm(printable_h))
    c.clipPath(clip, stroke=0, fill=0)

    piece_labels = []
    for placement in job.placements:
        def to_page(px, py, ox=placement.offset_x, oy=placement.offset_y):
            return (margin_mm + px + ox, margin_mm + py + oy)

        _stroke_polylines(
            c, to_page, placement.polylines,
            (margin_mm, margin_mm, margin_mm + printable_w, margin_mm + printable_h),
        )
        if placement.footer_label:
            piece_labels.append(placement.footer_label)
        if placement.centroid and (placement.cut_label or placement.shape_label):
            cx, cy = to_page(*placement.centroid)
            _draw_piece_labels(c, cx, cy, placement.shape_label, placement.cut_label)
    c.restoreState()

    _draw_crop_marks(c, page_w, page_h, margin_mm)
    _draw_scale_bar(c, margin_mm)
    summary = ", ".join(piece_labels) if piece_labels else "(empty page)"
    label = (
        f"{summary}  |  page {page_num}/{total_pages}  "
        f"-- fits whole, not split  |  Print at 100% / Actual Size -- do NOT 'fit to page', "
        f"verify the scale bar first"
    )
    _draw_footer(c, label, page_w, margin_mm, source_name, unit_note)

    c.restoreState()


def _polylines_bbox(polylines):
    xs = [p[0] for poly in polylines for p in poly]
    ys = [p[1] for poly in polylines for p in poly]
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def _overlaps(poly, x0, y0, x1, y1) -> bool:
    pb = _polylines_bbox([poly])
    if pb is None:
        return False
    return not (pb[2] < x0 or pb[0] > x1 or pb[3] < y0 or pb[1] > y1)


def _draw_registration_grid(c, to_page, x0, y0, x1, y1):
    """Small '+' crosshairs on a fixed absolute grid.

    Because the grid is anchored to absolute pattern coordinates (not to
    each tile), the same crosshair falls in the overlap region of both
    neighbouring pages at the exact same spot -- that's what makes lining
    them up under a lamp/window unambiguous.
    """
    import math

    c.setLineWidth(_mm(0.1))
    c.setStrokeColorRGB(0.5, 0.5, 0.5)

    gx0 = math.floor(x0 / REG_GRID_SPACING_MM) * REG_GRID_SPACING_MM
    gy0 = math.floor(y0 / REG_GRID_SPACING_MM) * REG_GRID_SPACING_MM

    gx = gx0
    while gx <= x1:
        gy = gy0
        while gy <= y1:
            if x0 <= gx <= x1 and y0 <= gy <= y1:
                px, py = to_page(gx, gy)
                _draw_cross(c, px, py, REG_MARK_SIZE_MM)
            gy += REG_GRID_SPACING_MM
        gx += REG_GRID_SPACING_MM

    c.setStrokeColorRGB(0, 0, 0)


def _draw_piece_labels(c, x_mm, y_mm, shape_label, cut_label):
    """Draw a piece's name and/or its "Cut N" count, centered on a point.

    "Cut N" is the actionable instruction (how many times to trace this
    shape), so it's always the visually dominant one -- bigger and bold.
    A shape name (from --label) is secondary: smaller, regular weight, and
    placed just above the cut count when both are present. With no cut
    count, the shape name is drawn a bit larger since it's then the only
    text on the piece.
    """
    c.setFillColorRGB(0, 0, 0)
    if cut_label and shape_label:
        c.setFont("Helvetica", SHAPE_LABEL_FONT_SIZE)
        c.drawCentredString(_mm(x_mm), _mm(y_mm) + CUT_LABEL_FONT_SIZE * 0.55, shape_label)
        c.setFont("Helvetica-Bold", CUT_LABEL_FONT_SIZE)
        c.drawCentredString(_mm(x_mm), _mm(y_mm) - CUT_LABEL_FONT_SIZE * 0.35, cut_label)
    elif cut_label:
        c.setFont("Helvetica-Bold", CUT_LABEL_FONT_SIZE)
        c.drawCentredString(_mm(x_mm), _mm(y_mm) - CUT_LABEL_FONT_SIZE * 0.35, cut_label)
    elif shape_label:
        c.setFont("Helvetica-Bold", SHAPE_LABEL_ALONE_FONT_SIZE)
        c.drawCentredString(_mm(x_mm), _mm(y_mm) - SHAPE_LABEL_ALONE_FONT_SIZE * 0.35, shape_label)


def _draw_cross(c, px_mm, py_mm, size_mm):
    half = size_mm / 2.0
    c.line(_mm(px_mm - half), _mm(py_mm), _mm(px_mm + half), _mm(py_mm))
    c.line(_mm(px_mm), _mm(py_mm - half), _mm(px_mm), _mm(py_mm + half))


def _draw_crop_marks(c, page_w, page_h, margin_mm):
    """Small L-marks at the printable-area corners, for trimming margins."""
    L = min(5.0, margin_mm)
    c.setLineWidth(_mm(0.2))
    c.setStrokeColorRGB(0, 0, 0)
    corners = [
        (margin_mm, margin_mm, 1, 1),
        (page_w - margin_mm, margin_mm, -1, 1),
        (margin_mm, page_h - margin_mm, 1, -1),
        (page_w - margin_mm, page_h - margin_mm, -1, -1),
    ]
    for x, y, dx, dy in corners:
        c.line(_mm(x), _mm(y), _mm(x + dx * L), _mm(y))
        c.line(_mm(x), _mm(y), _mm(x), _mm(y + dy * L))


def _fmt_cm(cm: float) -> str:
    return f"{cm:g}cm"


def _draw_scale_bar(c, margin_mm):
    """An L-shaped, two-axis scale bar in the bottom-left margin, labeled in
    cm on both arms, to sanity-check printer scaling on width AND height
    independently -- a single 1-D ruler can't catch a printer or PDF viewer
    that scales the two axes by different amounts.

    Both arms live entirely within the margin band (the horizontal arm at
    y < margin_mm, the vertical arm at x < margin_mm), the same unclipped
    region crop marks and the footer use, so it's never drawn over the
    actual pattern regardless of piece size or position.
    """
    x0 = min(3.0, margin_mm * 0.3)
    y0 = min(3.0, margin_mm * 0.3)
    width_mm = SCALE_BAR_WIDTH_CM * 10.0
    height_mm = SCALE_BAR_HEIGHT_CM * 10.0

    c.setLineWidth(_mm(0.25))
    c.setStrokeColorRGB(0, 0, 0)
    c.line(_mm(x0), _mm(y0), _mm(x0 + width_mm), _mm(y0))
    c.line(_mm(x0), _mm(y0), _mm(x0), _mm(y0 + height_mm))

    for i in range(0, int(width_mm) + 1, 10):
        tick = 1.5 if i in (0, int(width_mm)) else 0.8
        c.line(_mm(x0 + i), _mm(y0 - tick), _mm(x0 + i), _mm(y0 + tick))
    for i in range(0, int(height_mm) + 1, 10):
        tick = 1.5 if i in (0, int(height_mm)) else 0.8
        c.line(_mm(x0 - tick), _mm(y0 + i), _mm(x0 + tick), _mm(y0 + i))

    c.setFont("Helvetica-Bold", 6)
    c.drawString(_mm(x0 + 2), _mm(y0 + 1.6), _fmt_cm(SCALE_BAR_WIDTH_CM))

    c.saveState()
    c.translate(_mm(x0 + 1.6), _mm(y0 + 2))
    c.rotate(90)
    c.drawString(0, 0, _fmt_cm(SCALE_BAR_HEIGHT_CM))
    c.restoreState()


def _draw_footer(c, label, page_w, margin_mm, source_name, unit_note):
    c.setFont("Helvetica", 7)
    full_label = f"{os.path.basename(source_name)}  |  {label}"
    c.drawCentredString(_mm(page_w / 2.0), _mm(margin_mm * 0.75), full_label)
    if unit_note:
        c.setFont("Helvetica", 6)
        c.drawCentredString(_mm(page_w / 2.0), _mm(margin_mm * 0.35 + 3.5), unit_note)
    c.setFont("Helvetica", 6)
    c.drawRightString(
        _mm(page_w - margin_mm), _mm(margin_mm * 0.35),
        datetime.date.today().isoformat(),
    )


def _draw_overview(c, tile: Tile, page_w, page_h, margin_mm):
    """Tiny grid in the top-right corner showing which tile this page is."""
    if tile.rows * tile.cols <= 1:
        return
    cell = min(3.0, (margin_mm * 0.8) / max(tile.rows, tile.cols))
    if cell < 0.8:
        return
    grid_w = cell * tile.cols
    grid_h = cell * tile.rows
    ox = page_w - margin_mm - grid_w - 1.0
    oy = page_h - margin_mm + (margin_mm - grid_h) / 2.0

    c.setLineWidth(_mm(0.1))
    for r in range(tile.rows):
        for col in range(tile.cols):
            x = ox + col * cell
            y = oy + (tile.rows - 1 - r) * cell
            if r == tile.row and col == tile.col:
                c.setFillColorRGB(0, 0, 0)
                c.rect(_mm(x), _mm(y), _mm(cell), _mm(cell), stroke=1, fill=1)
            else:
                c.setFillColorRGB(1, 1, 1)
                c.rect(_mm(x), _mm(y), _mm(cell), _mm(cell), stroke=1, fill=0)
    c.setFillColorRGB(0, 0, 0)
