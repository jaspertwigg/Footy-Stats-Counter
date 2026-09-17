# leathercraft-pdf

Turn a pattern exported from a leathercraft CAD program (DXF, SVG, or
LeathercraftCAD's native `.lcc`) into a print-ready PDF at **exact,
true-to-life scale**. If the pattern is bigger than a sheet of paper, it's
automatically split across multiple pages with overlapping registration
marks so you can trim and tape them back together at the right size.

## Why not just "print to PDF" from the CAD program?

You can, if your pattern fits on one page and your CAD program's print
dialog preserves scale. This tool exists for the common cases that break
that: patterns bigger than A4/Letter, CAD programs whose PDF export doesn't
carry real-world units, or when you just want a script you can run the same
way every time without hunting through print-scale settings.

## Install

```bash
cd leathercraft-pdf
pip install -r requirements.txt
```

Needs Python 3.9+. Only two dependencies: `ezdxf` (DXF parsing) and
`reportlab` (PDF generation).

## Usage

```bash
python make_pdf.py path/to/pattern.dxf
python make_pdf.py path/to/pattern.svg -o wallet.pdf
python make_pdf.py path/to/project.lcc
```

By default it writes next to the input file with a `.pdf` extension, tiles
onto A4 with a 10mm margin and 15mm overlap between pages. Try it on the
bundled examples:

```bash
python make_pdf.py examples/simple_panel.dxf      # fits on one page
python make_pdf.py examples/large_bag_panel.dxf   # 500x350mm -> tiled across 6 A4 pages
```

### Options

| Flag | Default | What it does |
|---|---|---|
| `-o, --output` | `<input>.pdf` | Output PDF path |
| `--page-size` | `A4` | `A4`, `LETTER`, or `A3` |
| `--margin-mm` | `10` | Non-printable border on every page |
| `--overlap-mm` | `15` | Overlap between tiles, for taping alignment |
| `--tolerance-mm` | `0.1` | How finely curves/arcs are flattened to line segments |
| `--units-per-mm` | *(auto)* | Override unit detection (see below) |
| `--dpi` | `96` | Assumed pixel density for SVGs with no physical width/height |

## Preserving exact dimensions

Every coordinate in the input file is converted to millimetres once, up
front, and from that point on the tool only ever scales by exactly
`1mm -> 72/25.4 points` when drawing to the PDF page. There's no "fit to
page" step anywhere — if a pattern doesn't fit, it gets tiled instead of
shrunk, so nothing you draw ever gets rescaled to make it fit.

The two places dimensions can actually go wrong are outside this tool's
control, so it defends against both:

1. **Ambiguous units in the source file.** A DXF with no declared
   `$INSUNITS` is assumed to be millimetres (the common default for hobby
   CAD tools); an SVG with no physical `width`/`height` falls back to a
   96 DPI pixel assumption. Both print a warning to the terminal when this
   happens. If it's wrong, re-run with `--units-per-mm` set to the correct
   conversion factor (e.g. an SVG actually in 72 DPI Illustrator points
   would need `--units-per-mm 0.352778`).
2. **Printer/PDF-viewer scaling.** Every single page — tiled or not — has a
   50mm ruler with tick marks printed in the margin, labelled "measure with
   a ruler before cutting." When you print, **turn off any "fit to page" /
   "scale to fit" option and print at 100%**, then check that ruler with an
   actual ruler before cutting any leather. If it doesn't measure 50mm, redo
   the print with scaling disabled.

## How tiling works

When a pattern is larger than one page's printable area, it's split into a
grid of tiles. Each tile is rendered as its own full page, clipped to its
own rectangle, with:

- **Registration crosshairs** on a fixed 50mm grid, anchored to the
  pattern's own coordinates (not to each page). Because neighbouring tiles
  both include the overlap strip between them, they print the *same*
  crosshairs at the *same* physical spot — line them up (e.g. against a
  window or on a light table) and the pages are correctly aligned by
  construction, not by eye.
- **Crop marks** at the corners of the printable area, so you know where to
  trim before taping pages together.
- **A footer** naming the page number, its row/column in the tile grid, and
  a reminder to print at 100%.
- **A small position diagram** in the corner showing which tile you're
  holding, for patterns split into more than one page.

Cut along the crop marks, overlap adjacent sheets so the crosshairs line up
exactly, then tape.

## Supported input

**DXF:** `LINE`, `LWPOLYLINE`/`POLYLINE` (including bulges/arcs), `CIRCLE`,
`ARC`, `ELLIPSE`, `SPLINE`, `HATCH` boundaries, and `INSERT` block
references (exploded automatically). Units are read from the file's
`$INSUNITS` header.

**LeathercraftCAD (`.lcc`):** straight-line shapes (the vast majority of
real patterns). There's no public spec for this format, so support is
based on files actually seen rather than documentation: coordinates are
assumed to already be millimetres (no unit field exists in the format, but
line-thickness values consistently match millimetre conventions like
1.8mm), and any shape type other than a straight `LINE` is skipped with a
warning naming the type and count rather than silently guessed at or
dropped without notice. If your `.lcc` file uses curved shapes and the
warning about a "guessed curve" interpretation shows up, double-check
those edges against the original before cutting — that interpretation is
unverified against a real curved example. If a file produces warnings,
consider exporting to DXF or SVG from LeathercraftCAD instead, or share the
file so support can be extended.

**SVG:** `path` (all commands, including arcs and smooth curves), `line`,
`polyline`, `polygon`, `rect`, `circle`, `ellipse`, and `g` groups with
`transform` (`translate`/`scale`/`rotate`/`matrix`/`skewX`/`skewY`, and any
combination/nesting of those). Physical size is read from the document's
`width`/`height` (in `mm`/`cm`/`in`/`pt`/`pc`) combined with `viewBox` when
present.

**Not read as cutting geometry** (by design — these aren't pattern lines):
text/labels, raster images, fills/colours, layers, and DXF dimension
annotations. Rounded-corner (`rx`/`ry`) SVG `rect` elements are currently
treated as sharp-cornered rectangles — export corner rounding as a path
from your CAD program if you need it preserved.

### Tips for exporting from your CAD program

- Prefer DXF if your program supports it and the shapes are simple polygons
  and arcs — its unit handling is the most reliable of the two formats.
- If exporting SVG, use a version of your program's export dialog that sets
  a real physical `width`/`height` (e.g. `200mm`) rather than only a pixel
  size — that avoids the DPI-guessing fallback entirely.
- Whatever you export, treat the printed ruler as the actual proof of
  correctness for a given project, not this README.

## Running the tests

```bash
pip install pytest
pytest
```
