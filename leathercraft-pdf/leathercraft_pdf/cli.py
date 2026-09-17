from __future__ import annotations

import argparse
import sys

from .geometry import DEFAULT_TOLERANCE_MM, polyline_bbox
from .layout import PAGE_SIZES_MM, compute_tiles
from .packing import pack_pieces
from .pieces import group_into_pieces
from .render import PackedPageJob, TilePageJob, draw_pdf


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
            "was guessed wrong -- check the printed ruler and adjust this)."
        ),
    )
    p.add_argument(
        "--dpi", type=float, default=96.0,
        help="Assumed pixels-per-inch for SVGs with no physical width/height (default: 96)",
    )
    return p


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
                "Check the printed ruler on page 1 and pass --units-per-mm to correct if needed.",
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
                "Check the printed ruler on page 1 and pass --units-per-mm or --dpi to correct if needed.",
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
                "Check the printed ruler on page 1 and pass --units-per-mm to correct if needed.",
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

    pieces = group_into_pieces(polylines)
    print(f"Found {len(pieces)} separate piece(s) in the pattern.", file=sys.stderr)

    packed_pages, oversized = pack_pieces(pieces, page_size, args.margin_mm)

    # Number pieces in reading order (top-to-bottom, left-to-right on the
    # original canvas) so terminal output and on-page labels agree with how
    # someone would naturally scan the original CAD layout.
    ordered = sorted(pieces, key=lambda p: (-p.bbox[3], p.bbox[0]))
    piece_number = {id(p): i + 1 for i, p in enumerate(ordered)}
    total_pieces = len(pieces)

    pages = []
    for packed_page in packed_pages:
        placements = []
        for piece, ox, oy in packed_page.placements:
            label = f"piece {piece_number[id(piece)]}/{total_pieces}"
            placements.append((piece.polylines, ox, oy, label))
        pages.append(PackedPageJob(placements=placements))

    tiling_summary = []
    for piece in oversized:
        num = piece_number[id(piece)]
        pw, ph = piece.bbox[2] - piece.bbox[0], piece.bbox[3] - piece.bbox[1]
        tiles = compute_tiles(piece.bbox, page_size, args.margin_mm, args.overlap_mm)
        label = f"piece {num}/{total_pieces} ({pw:.0f}x{ph:.0f}mm)"
        for tile in tiles:
            pages.append(TilePageJob(polylines=piece.polylines, tile=tile, piece_label=label))
        tiling_summary.append(f"piece {num} ({pw:.0f}x{ph:.0f}mm) -> {tiles[-1].rows}x{tiles[-1].cols} pages")

    if packed_pages:
        fit_count = total_pieces - len(oversized)
        print(
            f"{fit_count} piece(s) fit on a page whole and were packed onto "
            f"{len(packed_pages)} page(s) without being split.",
            file=sys.stderr,
        )
    if oversized:
        print(
            f"{len(oversized)} piece(s) too large for one page, tiled individually "
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
