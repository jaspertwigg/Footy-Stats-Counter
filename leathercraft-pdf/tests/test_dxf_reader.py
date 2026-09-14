from leathercraft_pdf.geometry import polyline_bbox
from leathercraft_pdf.dxf_reader import read_dxf


def _make_dxf(tmp_path, insunits):
    import ezdxf

    doc = ezdxf.new(setup=False)
    doc.header["$INSUNITS"] = insunits
    msp = doc.modelspace()
    msp.add_lwpolyline(
        [(0, 0), (100, 0), (100, 50), (0, 50)], format="xy", close=True
    )
    path = str(tmp_path / "rect.dxf")
    doc.saveas(path)
    return path


def test_rectangle_mm_units(tmp_path):
    path = _make_dxf(tmp_path, insunits=4)  # 4 = millimetres
    polylines, info = read_dxf(path)
    assert info["assumed_mm_no_units_declared"] is False
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 100) < 1e-6
    assert abs((maxy - miny) - 50) < 1e-6


def test_rectangle_inch_units_converted_to_mm(tmp_path):
    path = _make_dxf(tmp_path, insunits=1)  # 1 = inches
    polylines, info = read_dxf(path)
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 100 * 25.4) < 1e-3
    assert abs((maxy - miny) - 50 * 25.4) < 1e-3


def test_no_declared_units_assumes_mm(tmp_path):
    path = _make_dxf(tmp_path, insunits=0)
    polylines, info = read_dxf(path)
    assert info["assumed_mm_no_units_declared"] is True
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 100) < 1e-6


def test_units_override(tmp_path):
    path = _make_dxf(tmp_path, insunits=0)
    polylines, info = read_dxf(path, unit_override=2.0)
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 200) < 1e-6


def test_circle_and_arc(tmp_path):
    import ezdxf

    doc = ezdxf.new(setup=False)
    doc.header["$INSUNITS"] = 4
    msp = doc.modelspace()
    msp.add_circle((0, 0), radius=20)
    msp.add_arc((0, 0), radius=10, start_angle=0, end_angle=90)
    path = str(tmp_path / "circle.dxf")
    doc.saveas(path)

    polylines, _ = read_dxf(path)
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    # Circle of radius 20 dominates the bbox.
    assert abs((maxx - minx) - 40) < 0.5
    assert abs((maxy - miny) - 40) < 0.5
