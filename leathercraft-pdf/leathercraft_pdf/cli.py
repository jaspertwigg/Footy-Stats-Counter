from __future__ import annotations

import argparse
import sys

from .geometry import DEFAULT_TOLERANCE_MM, polyline_bbox, polylines_centroid
from .layout import PAGE_SIZES_MM, compute_tiles
from .packing import pack_pieces
from .pieces import dedupe_identical_pieces, flip_vertical, group_into_pieces, is_irregular_shape
from .render import PackedPageJob, PiecePlacement, TilePageJob, draw_pdf


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="leathercraft-pdf",
        description=(
            "Convert a leathercraft CAD pattern (DXF, SVG, or LeathercraftCAD .lcc) "
            "into a print-ready, true-scale PDF. Large patterns are automatically "
            "tiled across multiple pages with registration marks so they can be "
            "taped back together at exact size."
        ),
    )
    p.add_argument("input", help="Path to the .dxf, .svg, or .lcc pattern file")
    p.add_argument("-o", "--output", help="Output PDF path (default: input name with .pdf extension)")
    p.add_argument(
        "--page-size", default="A4", choices=sorted(PAGE_SIZES_MM.keys()),
        help="Paper size to tile onto (default: A4)",
    )
    p.add_argument(
        "--orientation", default="auto", choices=["auto", "portrait", "landscape"],
        help=(
            "Page orientation. 'auto' (default) tries both portrait and "
            "landscape and picks whichever splits fewer pieces across pages "
            "(ties broken by total page count)."
        ),
    )
    p.add_argument("--margin-mm", type=float, default=10.0, help="Page margin in mm (default: 10)")
    p.add_argument(
        "--overlap-mm", type=float, default=15.0,
        help="Overlap between adjacent tiles in mm, for taping alignment (default: 15)",
    )
    p.add_argument(
        "--tolerance-mm", type=float, default=DEFAULT_TOLERANCE_MM,
        help="Curve flattening tolerance in mm (default: %(default)s)",
    )
    p.add_argument(
        "--units-per-mm", type=float, default=None,
        help=(
            "Override unit detection: how many mm one file-unit equals "
            "(e.g. for a DXF with no declared units, or an SVG whose scale "
            "was guessed wrong -- check the printed scale bar and adjust this)."
        ),
    )
    p.add_argument(
        "--dpi", type=float, default=96.0,
        help="Assumed pixels-per-inch for SVGs with no physical width/height (default: 96)",
    )
    p.add_argument(
        "--label", action="append", default=[], metavar="N=TEXT",
        help=(
            "Name a piece by its number, e.g. --label 1='Outer Shell' -- the "
            "name is printed on that shape, along with its 'Cut N' in "
            "parentheses if it has duplicates. Piece numbers are shown in "
            "the summary this tool prints on every run. Repeatable."
        ),
    )
    p.add_argument(
        "--flip", action="append", default=[], type=int, metavar="N",
        help=(
            "Mirror piece number N top-to-bottom in place (equivalent to a "
            "180 degree rotation for a shape that's already left-right "
            "symmetric). Use when a piece was reconstructed upside-down "
            "relative to how it should read once assembled. Repeatable."
        ),
    )
    return p


def _parse_labels(label_args, total_pieces):
    labels = {}
    for item in label_args:
        if "=" not in item:
            print(f"Invalid --label {item!r}: expected NUM=TEXT", file=sys.stderr)
            return None
        num_str, text = item.split("=", 1)
        try:
            num = int(num_str)
        except ValueError:
            print(f"Invalid --label {item!r}: {num_str!r} is not a piece number", file=sys.stderr)
            return None
        if not (1 <= num <= total_pieces):
            print(
                f"WARNING: --label {item!r} doesn't match any piece (there are {total_pieces})",
                file=sys.stderr,
            )
            continue
        labels[num] = text
    return labels


def _plan(pieces, page_size_mm, margin_mm, overlap_mm):
    """Pack+tile `pieces` onto `page_size_mm` and return a comparable plan.

    Returns (packed_pages, oversized_with_tiles, total_pages) where
    oversized_with_tiles is a list of (piece, tiles) for pieces that didn't
    fit whole. Used both to score a candidate orientation and, for the
    winner, to actually build the output pages.
    """
    packed_pages, oversized = pack_pieces(pieces, page_size_mm, margin_mm)
    oversized_with_tiles = [
        (piece, compute_tiles(piece.bbox, page_size_mm, margin_mm, overlap_mm)) for piece in oversized
    ]
    total_pages = len(packed_pages) + sum(len(tiles) for _, tiles in oversized_with_tiles)
    return packed_pages, oversized_with_tiles, total_pages


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    output = args.output or _default_output(args.input)
    page_size = PAGE_SIZES_MM[args.page_size.upper()]

    lower = args.input.lower()
    unit_note = ""
    if lower.endswith(".dxf"):
        from .dxf_reader import read_dxf

        polylines, info = read_dxf(args.input, tolerance=args.tolerance_mm, unit_override=args.units_per_mm)
        if info["assumed_mm_no_units_declared"]:
            print(
                "WARNING: DXF has no $INSUNITS declared -- assuming 1 unit = 1mm. "
                "Check the printed scale bar on page 1 and pass --units-per-mm to correct if needed.",
                file=sys.stderr,
            )
            unit_note = "Units: assumed 1 drawing unit = 1mm (not declared in file)"
        else:
            unit_note = f"Units: 1 drawing unit = {info['mm_per_unit']:.4g}mm"
    elif lower.endswith(".svg"):
        from .svg_reader import read_svg

        polylines, info = read_svg(args.input, tolerance=args.tolerance_mm, dpi=args.dpi, scale_override=args.units_per_mm)
        if info["is_guess"]:
            print(
                f"WARNING: SVG has no explicit physical size -- {info['detection_method']}. "
                "Check the printed scale bar on page 1 and pass --units-per-mm or --dpi to correct if needed.",
                file=sys.stderr,
            )
        unit_note = f"Scale: {info['detection_method']}"
    elif lower.endswith(".lcc"):
        from .lcc_reader import read_lcc

        polylines, info = read_lcc(args.input, tolerance=args.tolerance_mm, unit_override=args.units_per_mm)
        if info["assumed_mm_no_units_declared"]:
            print(
                "WARNING: .lcc files don't declare units -- assuming coordinates are "
                "already millimetres (LeathercraftCAD's usual convention). "
                "Check the printed scale bar on page 1 and pass --units-per-mm to correct if needed.",
                file=sys.stderr,
            )
            unit_note = "Units: assumed 1 file unit = 1mm (LeathercraftCAD default)"
        else:
            unit_note = f"Units: 1 file unit = {info['mm_per_unit']:.4g}mm"
        if info["skipped_shape_types"]:
            print(
                f"WARNING: skipped unsupported .lcc shape type(s): {info['skipped_shape_types']} "
                "-- only LINE shapes are currently understood, so parts of the pattern may be missing. "
                "Please share a sample file so support can be added.",
                file=sys.stderr,
            )
        if info["guessed_curve_count"]:
            print(
                f"WARNING: {info['guessed_curve_count']} curved LINE shape(s) used an unverified "
                "guess at how .lcc encodes bezier control points -- double-check curved edges "
                "against the original pattern.",
                file=sys.stderr,
            )
    else:
        print(f"Unsupported input file type: {args.input} (expected .dxf, .svg, or .lcc)", file=sys.stderr)
        return 2

    if not polylines:
        print("No drawable geometry found in the input file.", file=sys.stderr)
        return 1

    bbox = polyline_bbox(polylines)
    minx, miny, maxx, maxy = bbox
    width, height = maxx - minx, maxy - miny
    print(f"Overall canvas size: {width:.1f}mm x {height:.1f}mm", file=sys.stderr)

    raw_pieces = group_into_pieces(polylines)
    pieces = dedupe_identical_pieces(raw_pieces)
    duplicate_count = len(raw_pieces) - len(pieces)
    if duplicate_count:
        dupes = ", ".join(f"{p.cut_count} copies" for p in pieces if p.cut_count > 1)
        print(
            f"Found {len(raw_pieces)} piece(s), {len(pieces)} distinct shape(s) after merging "
            f"identical/mirrored duplicates ({dupes}) -- each is drawn once with a 'Cut N' label.",
            file=sys.stderr,
        )
    else:
        print(f"Found {len(pieces)} separate piece(s) in the pattern.", file=sys.stderr)

    landscape_size = (page_size[1], page_size[0])
    if args.orientation == "portrait":
        candidates = [("portrait", page_size)]
    elif args.orientation == "landscape":
        candidates = [("landscape", landscape_size)]
    else:
        candidates = [("portrait", page_size), ("landscape", landscape_size)]

    plans = {name: _plan(pieces, dims, args.margin_mm, args.overlap_mm) for name, dims in candidates}
    best_name = min(plans, key=lambda name: (len(plans[name][1]), plans[name][2]))
    page_size = dict(candidates)[best_name]
    packed_pages, oversized_with_tiles, _ = plans[best_name]

    if len(candidates) > 1:
        other = [n for n in plans if n != best_name][0]
        print(
            f"Orientation: {best_name} ({len(plans[best_name][1])} oversized piece(s), "
            f"{plans[best_name][2]} page(s) total) beats {other} "
            f"({len(plans[other][1])} oversized, {plans[other][2]} pages) -- using {best_name}.",
            file=sys.stderr,
        )

    # Number pieces in reading order (top-to-bottom, left-to-right on the
    # original canvas) so terminal output and on-page labels agree with how
    # someone would naturally scan the original CAD layout.
    ordered = sorted(pieces, key=lambda p: (-p.bbox[3], p.bbox[0]))
    piece_number = {id(p): i + 1 for i, p in enumerate(ordered)}
    total_pieces = len(pieces)

    labels = _parse_labels(args.label, total_pieces)
    if labels is None:
        return 2

    flipped_nums = set()
    for num in args.flip:
        if not (1 <= num <= total_pieces):
            print(f"WARNING: --flip {num} doesn't match any piece (there are {total_pieces})", file=sys.stderr)
            continue
        flip_vertical(ordered[num - 1])
        flipped_nums.add(num)

    print("Pieces found (use --label N=text to name one, e.g. --label 1='Outer Shell'):", file=sys.stderr)
    for p in ordered:
        num = piece_number[id(p)]
        pw, ph = p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]
        tag = f"Cut {p.cut_count}" if p.cut_count > 1 else "single"
        shape_note = ", irregular/notched shape" if is_irregular_shape(p) else ""
        named = f" -> {labels[num]!r}" if num in labels else ""
        flipped_note = " [flipped]" if num in flipped_nums else ""
        print(f"  piece {num}/{total_pieces}: {pw:.0f}x{ph:.0f}mm ({tag}{shape_note}){named}{flipped_note}", file=sys.stderr)

    def cut_label_for(piece):
        return f"Cut {piece.cut_count}" if piece.cut_count > 1 else None

    pages = []
    for packed_page in packed_pages:
        placements = []
        for piece, ox, oy in packed_page.placements:
            num = piece_number[id(piece)]
            footer_label = f"piece {num}/{total_pieces}"
            shape_label = labels.get(num)
            cut_label = cut_label_for(piece)
            centroid = polylines_centroid(piece.polylines) if (cut_label or shape_label) else None
            placements.append(
                PiecePlacement(
                    polylines=piece.polylines, offset_x=ox, offset_y=oy,
                    footer_label=footer_label, cut_label=cut_label, shape_label=shape_label,
                    centroid=centroid,
                )
            )
        pages.append(PackedPageJob(placements=placements))

    tiling_summary = []
    for piece, tiles in oversized_with_tiles:
        num = piece_number[id(piece)]
        pw, ph = piece.bbox[2] - piece.bbox[0], piece.bbox[3] - piece.bbox[1]
        label = f"piece {num}/{total_pieces} ({pw:.0f}x{ph:.0f}mm)"
        cut_label = cut_label_for(piece)
        shape_label = labels.get(num)
        centroid = polylines_centroid(piece.polylines) if (cut_label or shape_label) else None
        label_placed = False
        for tile in tiles:
            owns_label = False
            if centroid and not label_placed:
                cx, cy = centroid
                x0, y0, x1, y1 = tile.rect
                if x0 <= cx <= x1 and y0 <= cy <= y1:
                    owns_label = True
                    label_placed = True
            pages.append(
                TilePageJob(
                    polylines=piece.polylines, tile=tile, piece_label=label,
                    cut_label=cut_label if owns_label else None,
                    shape_label=shape_label if owns_label else None,
                    cut_centroid=centroid if owns_label else None,
                )
            )
        tiling_summary.append(f"piece {num} ({pw:.0f}x{ph:.0f}mm) -> {tiles[-1].rows}x{tiles[-1].cols} pages")

    if packed_pages:
        fit_count = total_pieces - len(oversized_with_tiles)
        print(
            f"{fit_count} piece(s) fit on a page whole and were packed onto "
            f"{len(packed_pages)} page(s) without being split.",
            file=sys.stderr,
        )
    if oversized_with_tiles:
        print(
            f"{len(oversized_with_tiles)} piece(s) too large for one page, tiled individually "
            f"with {args.overlap_mm}mm overlap: " + "; ".join(tiling_summary),
            file=sys.stderr,
        )

    draw_pdf(output, pages, page_size, args.margin_mm, args.input, unit_note)
    print(f"Wrote {output} ({len(pages)} page(s) total)", file=sys.stderr)
    return 0


def _default_output(input_path: str) -> str:
    base = input_path.rsplit(".", 1)[0]
    return base + ".pdf"


if __name__ == "__main__":
    sys.exit(main())
