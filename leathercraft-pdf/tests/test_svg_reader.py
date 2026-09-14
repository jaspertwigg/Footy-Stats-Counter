import textwrap

from leathercraft_pdf.geometry import polyline_bbox
from leathercraft_pdf.svg_reader import read_svg


def _write(tmp_path, name, content):
    f = tmp_path / name
    f.write_text(content)
    return str(f)


def test_rect_with_explicit_mm_size(tmp_path):
    svg = textwrap.dedent(
        """\
        <svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100">
          <rect x="10" y="10" width="50" height="30"/>
        </svg>
        """
    )
    path = _write(tmp_path, "rect.svg", svg)
    polylines, info = read_svg(path)
    assert info["is_guess"] is False
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 50) < 1e-6
    assert abs((maxy - miny) - 30) < 1e-6


def test_px_only_svg_uses_dpi_guess(tmp_path):
    # No viewBox, no physical unit: 96 user units should become exactly 1 inch.
    svg = textwrap.dedent(
        """\
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
          <rect x="0" y="0" width="96" height="96"/>
        </svg>
        """
    )
    path = _write(tmp_path, "px.svg", svg)
    polylines, info = read_svg(path, dpi=96.0)
    assert info["is_guess"] is True
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 25.4) < 1e-6


def test_scale_override_wins(tmp_path):
    svg = textwrap.dedent(
        """\
        <svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100">
          <rect x="0" y="0" width="10" height="10"/>
        </svg>
        """
    )
    path = _write(tmp_path, "override.svg", svg)
    polylines, info = read_svg(path, scale_override=2.0)
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 20) < 1e-6


def test_path_with_transform_and_curve(tmp_path):
    svg = textwrap.dedent(
        """\
        <svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
          <g transform="translate(10,10)">
            <path d="M0,0 L20,0 L20,20 L0,20 Z"/>
          </g>
        </svg>
        """
    )
    path = _write(tmp_path, "path.svg", svg)
    polylines, _ = read_svg(path)
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 20) < 1e-6
    assert abs((maxy - miny) - 20) < 1e-6
    # translate(10,10) in SVG space should land at x in [10,30] mm.
    assert abs(minx - 10) < 1e-6


def test_y_axis_is_flipped_relative_to_svg():
    # SVG y grows downward; our internal space is y-up, so a point below
    # another in SVG source should end up with a *smaller* y internally.
    import textwrap as tw

    svg = tw.dedent(
        """\
        <svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
          <line x1="0" y1="0" x2="0" y2="50"/>
        </svg>
        """
    )
    import tempfile, os

    fd, p = tempfile.mkstemp(suffix=".svg")
    os.write(fd, svg.encode())
    os.close(fd)
    try:
        polylines, _ = read_svg(p)
        (x1, y1), (x2, y2) = polylines[0]
        assert y2 < y1
    finally:
        os.remove(p)
