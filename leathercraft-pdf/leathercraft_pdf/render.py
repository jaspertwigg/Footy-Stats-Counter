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

import os
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as rl_canvas

from .geometry import Polyline
from .layout import Tile

MM_TO_PT = 72.0 / 25.4

REG_GRID_SPACING_MM = 50.0
REG_MARK_SIZE_MM = 3.0
LINE_WIDTH_MM = 0.15
SCALE_BAR_WIDTH_CM = 5.0
SCALE_BAR_HEIGHT_CM = 3.0

# Piece labels: as large as fits, word-wrapped to the piece's own width, the
# cut count always broken onto its own line -- shrinking all the way down to
# MIN before ever letting a label spill outside its shape.
PIECE_LABEL_FONT = "Helvetica-Bold"
MAX_PIECE_LABEL_FONT_SIZE = 20
MIN_PIECE_LABEL_FONT_SIZE = 5
PIECE_LABEL_LINE_SPACING = 1.15
PIECE_LABEL_WIDTH_FRACTION = 0.85  # inset from the piece's true edges
PIECE_LABEL_HEIGHT_FRACTION = 0.85


@dataclass
class PiecePlacement:
    polylines: List[Polyline]
    offset_x: float
    offset_y: float
    # Set only for a deduped piece with more than one copy, e.g. "Cut 2".
    cut_label: Optional[str] = None
    # A user-supplied name for this piece (--label), e.g. "Outer Shell".
    # Combined with cut_label (if set) into one line, e.g.
    # "Outer Shell (Cut 2)".
    shape_label: Optional[str] = None
    # Pattern-space (px, py), before offset_x/offset_y -- where to center
    # cut_label/shape_label, if either is set.
    centroid: Optional[Tuple[float, float]] = None
    # The piece's own (width, height) in mm -- how far the label text is
    # allowed to spread before it must wrap or shrink.
    piece_size_mm: Optional[Tuple[float, float]] = None


@dataclass
class PackedPageJob:
    placements: List[PiecePlacement] = field(default_factory=list)


@dataclass
class TilePageJob:
    polylines: List[Polyline]
    tile: Tile
    # Only set on the one tile page that "owns" showing this piece's cut
    # and/or shape label (its centroid falls within that tile's rect).
    cut_label: Optional[str] = None
    shape_label: Optional[str] = None
    cut_centroid: Optional[Tuple[float, float]] = None
    piece_size_mm: Optional[Tuple[float, float]] = None


def _mm(v: float) -> float:
    return v * MM_TO_PT


def draw_pdf(
    output_path: str,
    pages: List,  # list of PackedPageJob | TilePageJob, in the order they should be printed
    page_size_mm: Tuple[float, float],
    margin_mm: float,
    source_name: str,
):
    page_w, page_h = page_size_mm
    c = rl_canvas.Canvas(output_path, pagesize=(_mm(page_w), _mm(page_h)))
    title = os.path.basename(source_name)

    for page in pages:
        if isinstance(page, TilePageJob):
            _draw_tile_page(c, page, page_size_mm, margin_mm, title)
        else:
            _draw_packed_page(c, page, page_size_mm, margin_mm, title)
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


def _draw_tile_page(c, job: TilePageJob, page_size_mm, margin_mm, title):
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
        pw, ph = job.piece_size_mm or (tile_w, tile_h)
        _draw_piece_labels(c, cx, cy, pw, ph, job.shape_label, job.cut_label)
    c.restoreState()

    # --- Page furniture: crop marks, scale bar, header, overview (unclipped) ---
    _draw_crop_marks(c, page_w, page_h, margin_mm)
    _draw_scale_bar(c, margin_mm)
    _draw_header(c, page_w, page_h, margin_mm, title)
    _draw_overview(c, tile, page_w, page_h, margin_mm)

    c.restoreState()


def _draw_packed_page(c, job: PackedPageJob, page_size_mm, margin_mm, title):
    page_w, page_h = page_size_mm
    printable_w, printable_h = page_w - 2 * margin_mm, page_h - 2 * margin_mm

    c.saveState()
    c.saveState()
    clip = c.beginPath()
    clip.rect(_mm(margin_mm), _mm(margin_mm), _mm(printable_w), _mm(printable_h))
    c.clipPath(clip, stroke=0, fill=0)

    for placement in job.placements:
        def to_page(px, py, ox=placement.offset_x, oy=placement.offset_y):
            return (margin_mm + px + ox, margin_mm + py + oy)

        _stroke_polylines(
            c, to_page, placement.polylines,
            (margin_mm, margin_mm, margin_mm + printable_w, margin_mm + printable_h),
        )
        if placement.centroid and (placement.cut_label or placement.shape_label):
            cx, cy = to_page(*placement.centroid)
            pw, ph = placement.piece_size_mm or (printable_w, printable_h)
            _draw_piece_labels(c, cx, cy, pw, ph, placement.shape_label, placement.cut_label)
    c.restoreState()

    _draw_crop_marks(c, page_w, page_h, margin_mm)
    _draw_scale_bar(c, margin_mm)
    _draw_header(c, page_w, page_h, margin_mm, title)

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


def _wrap_to_width(text, font, size, max_width_pt):
    """Greedy word-wrap: as many words per line as fit in max_width_pt."""
    words = text.split()
    if not words:
        return []
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if stringWidth(candidate, font, size) <= max_width_pt:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _layout_piece_label(shape_label, cut_label, avail_w_pt, avail_h_pt):
    """Word-wrap `shape_label` and put `cut_label` on its own line(s),
    picking the largest font size (from MAX down to MIN) at which the
    whole block fits within avail_w_pt x avail_h_pt.

    Returns (font_size, lines, name_line_count). `lines[:name_line_count]`
    is the (possibly wrapped) name; the rest is the cut count.
    """
    cut_text = f"({cut_label})" if cut_label else None

    def build(size):
        name_lines = _wrap_to_width(shape_label, PIECE_LABEL_FONT, size, avail_w_pt) if shape_label else []
        cut_lines = _wrap_to_width(cut_text, PIECE_LABEL_FONT, size, avail_w_pt) if cut_text else []
        return name_lines, cut_lines

    def measure(name_lines, cut_lines, size):
        all_lines = name_lines + cut_lines
        if not all_lines:
            return 0.0, 0.0
        line_height = size * PIECE_LABEL_LINE_SPACING
        gap = line_height * 0.35 if (name_lines and cut_lines) else 0.0
        total_height = line_height * len(all_lines) + gap
        max_width = max(stringWidth(line, PIECE_LABEL_FONT, size) for line in all_lines)
        return total_height, max_width

    for size in range(MAX_PIECE_LABEL_FONT_SIZE, MIN_PIECE_LABEL_FONT_SIZE - 1, -1):
        name_lines, cut_lines = build(size)
        total_height, max_width = measure(name_lines, cut_lines, size)
        if total_height <= avail_h_pt and max_width <= avail_w_pt:
            return size, name_lines + cut_lines, len(name_lines)

    # Nothing fit even at the minimum size -- use it anyway, best effort,
    # rather than showing no label at all.
    name_lines, cut_lines = build(MIN_PIECE_LABEL_FONT_SIZE)
    return MIN_PIECE_LABEL_FONT_SIZE, name_lines + cut_lines, len(name_lines)


def _draw_piece_labels(c, x_mm, y_mm, piece_w_mm, piece_h_mm, shape_label, cut_label):
    """Draw a piece's name and/or its "Cut N" count, centered on a point,
    word-wrapped and auto-shrunk to fit within the piece's own bounding
    box -- the name never spills outside the shape. The cut count always
    lands on a line of its own, parenthesized, below the name.

    A shape whose name contains "horizontal" gets its label rotated 90
    degrees clockwise -- e.g. a narrow "Horizontal Pocket Divider" piece
    where sideways text reads more naturally along its length. Rotating
    swaps which of the piece's two dimensions bounds line width vs. total
    block height, since text now reads along what was the piece's height.
    """
    if not shape_label and not cut_label:
        return

    rotate_cw = bool(shape_label) and "horizontal" in shape_label.lower()
    text_w_mm, text_h_mm = (piece_h_mm, piece_w_mm) if rotate_cw else (piece_w_mm, piece_h_mm)
    avail_w_pt = _mm(text_w_mm) * PIECE_LABEL_WIDTH_FRACTION
    avail_h_pt = _mm(text_h_mm) * PIECE_LABEL_HEIGHT_FRACTION

    size, lines, name_line_count = _layout_piece_label(shape_label, cut_label, avail_w_pt, avail_h_pt)
    if not lines:
        return

    n = len(lines)
    line_height = size * PIECE_LABEL_LINE_SPACING
    has_gap = 0 < name_line_count < n
    gap = line_height * 0.35 if has_gap else 0.0

    # Baseline for line i, block vertically centered on the origin; lines
    # from name_line_count onward (the cut count) get pushed down by the
    # extra gap, and the whole stack re-centered to absorb it.
    baselines = [((n - 1) / 2.0 - i) * line_height - size * 0.35 for i in range(n)]
    if has_gap:
        for i in range(name_line_count, n):
            baselines[i] -= gap
        baselines = [y + gap / 2.0 for y in baselines]

    c.saveState()
    c.translate(_mm(x_mm), _mm(y_mm))
    if rotate_cw:
        c.rotate(-90)
    c.setFillColorRGB(0, 0, 0)
    c.setFont(PIECE_LABEL_FONT, size)
    for line, y in zip(lines, baselines):
        c.drawCentredString(0, y, line)
    c.restoreState()


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
    """An L-shaped, two-axis scale bar just inside the printable area's
    bottom-left corner, labeled in cm on both arms, to sanity-check printer
    scaling on width AND height independently -- a single 1-D ruler can't
    catch a printer or PDF viewer that scales the two axes by different
    amounts.

    Deliberately inside the print boundary (not out in the margin): many
    printers have their own hardware non-printable border near the true
    page edge, which could clip a scale bar sitting right at it -- placing
    it just inside the printable rect means it always actually prints.
    """
    x0 = margin_mm + 3.0
    y0 = margin_mm + 3.0
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


def _draw_header(c, page_w, page_h, margin_mm, title):
    """Just the title, centered in the top margin -- plain text, no rule,
    box, or other decoration underneath it.
    """
    c.setFont("Helvetica-Bold", 9)
    c.setFillColorRGB(0, 0, 0)
    c.drawCentredString(_mm(page_w / 2.0), _mm(page_h - margin_mm * 0.6), title)


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
