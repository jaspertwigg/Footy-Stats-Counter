import json

from leathercraft_pdf.geometry import polyline_bbox
from leathercraft_pdf.lcc_reader import read_lcc


def _write_lcc(tmp_path, shapes):
    doc = {
        "meta": {"file_type": "LeathercraftCAD", "version": "1.6.7"},
        "layers": [{"id": 0, "nam": "Layer 1"}],
        "shapes": shapes,
        "backdrops": [],
    }
    path = tmp_path / "test.lcc"
    # Real LeathercraftCAD files are UTF-8 with a BOM; make sure that's handled.
    path.write_text("﻿" + json.dumps(doc), encoding="utf-8")
    return str(path)


def _line(sp, ep, bz1=None, bz2=None):
    return {"type": "LINE", "sp": sp, "ep": ep, "bz1": bz1 or [0, 0], "bz2": bz2 or [0, 0]}


def test_rectangle_of_straight_lines(tmp_path):
    shapes = [
        _line([0, 0], [100, 0]),
        _line([100, 0], [100, 50]),
        _line([100, 50], [0, 50]),
        _line([0, 50], [0, 0]),
    ]
    path = _write_lcc(tmp_path, shapes)
    polylines, info = read_lcc(path)
    assert info["assumed_mm_no_units_declared"] is True
    assert info["skipped_shape_types"] == {}
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 100) < 1e-6
    assert abs((maxy - miny) - 50) < 1e-6


def test_units_override(tmp_path):
    shapes = [_line([0, 0], [100, 0])]
    path = _write_lcc(tmp_path, shapes)
    polylines, info = read_lcc(path, unit_override=2.0)
    minx, miny, maxx, maxy = polyline_bbox(polylines)
    assert abs((maxx - minx) - 200) < 1e-6


def test_unknown_shape_type_is_skipped_and_reported(tmp_path):
    shapes = [
        _line([0, 0], [10, 0]),
        {"type": "BEZIER", "sp": [0, 0], "ep": [10, 10]},
    ]
    path = _write_lcc(tmp_path, shapes)
    polylines, info = read_lcc(path)
    assert len(polylines) == 1
    assert info["skipped_shape_types"] == {"BEZIER": 1}


def test_nonzero_bezier_offsets_are_flattened_and_counted(tmp_path):
    shapes = [_line([0, 0], [10, 0], bz1=[0, 5], bz2=[0, 5])]
    path = _write_lcc(tmp_path, shapes)
    polylines, info = read_lcc(path)
    assert info["guessed_curve_count"] == 1
    assert len(polylines[0]) > 2  # curve got flattened into multiple segments
