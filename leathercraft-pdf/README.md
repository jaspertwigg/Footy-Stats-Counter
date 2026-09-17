# leathercraft-pdf

Turn a pattern exported from a leathercraft CAD program (DXF, SVG, or
LeathercraftCAD's native `.lcc`) into a print-ready PDF at **exact,
true-to-life scale**. A CAD file is usually a whole layout with several
separate pattern pieces on one canvas, so this first works out where each
piece actually begins and ends: pieces small enough for one page are packed
onto pages whole and are **never split**; only a piece that's genuinely too
big for a single sheet gets tiled across multiple pages, with overlapping
registration marks so you can trim and tape it back together at the right
size.

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

By default it writes next to the input file with a `.pdf` extension, targets
A4 with a 10mm margin, and (for any piece too big to fit whole) tiles with a
15mm overlap between pages. Page orientation defaults to `auto`: it tries
both portrait and landscape and picks whichever splits fewer pieces across
pages (ties go to portrait), since a piece that's too wide for portrait
often fits landscape without being touched at all. It prints a summary of
what it found and decided:

```
Overall canvas size: 235.0mm x 473.3mm
Found 8 separate piece(s) in the pattern.
Orientation: landscape (0 oversized piece(s), 3 page(s) total) beats portrait (2 oversized, 6 pages) -- using landscape.
8 piece(s) fit on a page whole and were packed onto 3 page(s) without being split.
Wrote wallet.pdf (3 page(s) total)
```

Force a specific orientation with `--orientation portrait` / `--orientation landscape` if you have a reason to (e.g. matching how you'll organize printed sheets); `auto` is almost always the better choice.

Try it on the bundled examples:

```bash
python make_pdf.py examples/simple_panel.dxf        # one piece, fits on one page, centered
python make_pdf.py examples/large_bag_panel.dxf     # one 500x350mm piece -> tiled across 4 A4 pages (landscape)
# 3 identical straps -> drawn once, labeled "Shoulder Strap" + "Cut 3"
python make_pdf.py examples/duplicate_straps.dxf --label 2="Shoulder Strap" --label 1="Buckle Loop"
```

### Options

| Flag | Default | What it does |
|---|---|---|
| `-o, --output` | `<input>.pdf` | Output PDF path |
| `--page-size` | `A4` | `A4`, `LETTER`, or `A3` |
| `--orientation` | `auto` | `auto`, `portrait`, or `landscape` -- `auto` picks whichever splits fewer pieces |
| `--margin-mm` | `10` | Non-printable border on every page |
| `--overlap-mm` | `15` | Overlap between tiles, for taping alignment |
| `--tolerance-mm` | `0.1` | How finely curves/arcs are flattened to line segments |
| `--units-per-mm` | *(auto)* | Override unit detection (see below) |
| `--dpi` | `96` | Assumed pixel density for SVGs with no physical width/height |
| `--label N=TEXT` | *(none)* | Name piece number `N`, e.g. `--label 1="Outer Shell"`. Repeatable. |
| `--flip N` | *(none)* | Mirror piece number `N` top-to-bottom in place, e.g. `--flip 5`. Repeatable. |

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
2. **Printer/PDF-viewer scaling.** Every single page — tiled or not — has an
   L-shaped scale bar printed in the bottom-left margin: a 5cm horizontal
   arm and a 3cm vertical arm, each labeled with its own length in cm.
   Checking both axes separately (not just one ruler) catches a printer or
   viewer that scales width and height by different amounts, not just
   uniform "fit to page" shrinking. When you print, **turn off any "fit to
   page" / "scale to fit" option and print at 100%**, then measure both
   arms with an actual ruler before cutting any leather — if either doesn't
   match its label, redo the print with scaling disabled.

## How piece detection works

A CAD file is just geometry on a canvas — nothing in DXF, SVG, or `.lcc`
says "these lines are one cuttable piece." That grouping is worked out by
tracing connectivity: lines that share an endpoint are chained into the
same piece (this is how separate `.lcc` `LINE` segments get rebuilt into
outlines, pulling in touching fold-mark ticks along the way), and a small
closed shape sitting entirely inside another one's outline — a stitch hole,
a punch mark — is folded into that piece even though it never touches it.

This is deliberately conservative: two pieces are only ever merged when
they clearly belong together (shared vertices, or full containment), never
merged just for being nearby, since that's what real efficient nesting
layouts look like (unrelated pieces slotted right next to or even
overlapping each other's bounding box). The trade-off is a construction
line that merely *crosses* a piece's outline without touching a shared
vertex or being fully enclosed by it won't be detected as belonging to that
piece, and will show up as its own tiny separate piece instead. This
hasn't come up in real `.lcc` files tested so far — construction marks
there are attached at real vertices — but if the piece count the tool
reports looks higher than the actual number of parts in your pattern,
that's the likely cause; let us know and we can extend the detection.

## Duplicate pieces

Wallets, bags, and most leathercraft patterns reuse the same shape more than
once (two strap pieces, four matching card slots, a mirrored left/right
body panel). Before laying out pages, identical pieces are detected — same
bounding-box size and the same multiset of edge lengths — and collapsed to
a single representative, printed once with a bold **"Cut N"** label at its
center instead of drawing every copy. A mirror-imaged copy counts as
identical too (reflecting a shape changes neither its edge lengths nor its
bounding box), since cutting a mirrored pair from one flipped template is
standard practice. Detection is exact-geometry, not "looks about the same
size" — two different shapes that happen to share a bounding box are never
merged. The terminal output says what happened:

```
Found 8 piece(s), 5 distinct shape(s) after merging identical/mirrored duplicates (2 copies, 2 copies, 2 copies) -- each is drawn once with a 'Cut N' label.
```

## Naming pieces

Every run prints a numbered list of the distinct shapes it found, so you can
identify which piece is which before naming any of them:

```
Pieces found (use --label N=text to name one, e.g. --label 1='Outer Shell'):
  piece 1/5: 235x86mm (single)
  piece 2/5: 222x86mm (single)
  piece 3/5: 102x55mm (Cut 2, irregular/notched shape)
  piece 4/5: 102x55mm (Cut 2)
  piece 5/5: 102x86mm (Cut 2)
```

The `irregular/notched shape` note flags a piece with at least one edge
that's neither its bounding-box width nor height (a trapezoid, an angled
corner) — handy for telling apart two pieces that share a bounding box but
aren't actually the same shape, like `piece 3` and `piece 4` above.

Pass `--label N=TEXT` (repeatable) to name pieces by their number:

```bash
python make_pdf.py wallet.lcc \
  --label 1="Outer Shell" --label 2="Inner Shell" --label 5="Hidden Pocket" \
  --label 3="Extra Pocket" --label 4="Front Pocket"
```

The name is printed on that shape in one large, bold, consistent size.
If the piece has duplicates, its "Cut N" is appended in parentheses on the
same line, e.g. `Hidden Pocket (Cut 2)`, so it still reads as separate,
supplementary information without needing a different size or weight to
set it apart. A piece with no name just shows `(Cut N)` on its own.

Any name containing the word "horizontal" (case-insensitive) gets its
label rotated 90 degrees clockwise, for a piece narrow enough that
sideways text reads more naturally along its length — e.g.
`--label 7="Horizontal Front Pocket"`.

If a piece's geometry came out of the CAD file upside-down relative to how
it should read once cut and assembled, pass `--flip N` (repeatable) to
mirror it top-to-bottom in place — e.g. `--flip 5`. This changes the
piece's actual cut lines, not just its label; the bounding box (and so
page layout) is unaffected, since a flip about a shape's own center keeps
the same rectangle.

## How pages are laid out

Once pieces are known (after deduplication), each one is either **packed**
(if it fits on one page) or **tiled** (if it's too big for any single page)
— never both, and a packed piece is never split.

**Packed pages** hold one or more whole pieces, placed edge to edge to use
paper efficiently, in this order:

1. **The two largest pieces each get a page to themselves**, even if
   something smaller would technically fit alongside them — a big piece
   sharing a page with several small ones is easy to misread when you're
   sorting through printouts.
2. **Everything else is grouped by how similar its size is**, so a page
   tends to hold "the four card-slot pieces" rather than an arbitrary mix.
   This is a soft preference, not a hard rule: if a size group doesn't
   exactly fill a page, the next group may fill the leftover space rather
   than starting a fresh sheet and wasting paper.

Pieces are never rotated to pack tighter, since leather has a grain
direction and a pattern piece's orientation usually matters. Which pieces
ended up on which page is named in the footer (e.g. `piece 3/8, piece 5/8`)
rather than stamped on the artwork itself.

Whatever ends up on a packed page — one piece alone, or several packed
together — is then centered as a block within the printable area, both
horizontally and vertically. A single piece sits in the middle of the page;
several pieces keep their packed arrangement relative to each other and
that whole group is centered together, rather than each piece being
centered separately.

**Tiled pages** are used only for a piece too big for one sheet. Each tile
is its own full page, clipped to its own rectangle, with:

- **Registration crosshairs** on a fixed 50mm grid, anchored to the piece's
  own coordinates (not to each page). Because neighbouring tiles both
  include the overlap strip between them, they print the *same* crosshairs
  at the *same* physical spot — line them up (e.g. against a window or on a
  light table) and the pages are correctly aligned by construction, not by
  eye.
- **Crop marks** at the corners of the printable area, so you know where to
  trim before taping pages together.
- **A small position diagram** in the corner showing which tile you're
  holding.

Every page — packed or tiled — has a footer naming what's on it and a
reminder to print at 100%. Cut along the crop marks, overlap adjacent
tiled sheets so the crosshairs line up exactly, then tape.

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
- Whatever you export, treat the printed scale bar as the actual proof of
  correctness for a given project, not this README.

## Running the tests

```bash
pip install pytest
pytest
```
