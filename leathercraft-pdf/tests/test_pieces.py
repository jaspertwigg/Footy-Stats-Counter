from leathercraft_pdf.pieces import group_into_pieces


def _rect_lines(x0, y0, x1, y1):
    """A rectangle as 4 independent LINE segments, like .lcc stores them."""
    return [
        [(x0, y0), (x1, y0)],
        [(x1, y0), (x1, y1)],
        [(x1, y1), (x0, y1)],
        [(x0, y1), (x0, y0)],
    ]


def test_two_far_apart_rectangles_are_separate_pieces():
    polylines = _rect_lines(0, 0, 10, 10) + _rect_lines(100, 100, 110, 110)
    pieces = group_into_pieces(polylines)
    assert len(pieces) == 2
    boxes = sorted(p.bbox for p in pieces)
    assert boxes[0] == (0, 0, 10, 10)
    assert boxes[1] == (100, 100, 110, 110)


def test_connected_segments_form_one_piece():
    # 4 separate LINE segments that chain together at shared endpoints.
    polylines = _rect_lines(0, 0, 50, 30)
    pieces = group_into_pieces(polylines)
    assert len(pieces) == 1
    assert pieces[0].bbox == (0, 0, 50, 30)
    assert len(pieces[0].polylines) == 4


def test_fold_mark_tick_attaches_to_its_outline():
    outline = _rect_lines(0, 0, 50, 30)
    tick = [[(0, 0), (0, -5)]]  # touches the outline's corner
    pieces = group_into_pieces(outline + tick)
    assert len(pieces) == 1
    assert len(pieces[0].polylines) == 5


def test_hole_fully_inside_an_outline_joins_that_piece():
    outline = _rect_lines(0, 0, 100, 100)
    # A small "stitch hole" circle-like closed polyline entirely inside,
    # not touching the outline at any point.
    hole = [[(40, 40), (60, 40), (60, 60), (40, 60), (40, 40)]]
    pieces = group_into_pieces(outline + hole)
    assert len(pieces) == 1
    assert len(pieces[0].polylines) == 5


def test_adjacent_but_separate_pieces_stay_separate():
    # Two rectangles placed edge-to-edge (nested for cutting efficiency),
    # touching but not sharing exact endpoints and not contained in each
    # other -- must NOT be merged into one piece.
    a = _rect_lines(0, 0, 50, 50)
    b = _rect_lines(50.3, 0, 100, 50)
    pieces = group_into_pieces(a + b)
    assert len(pieces) == 2


def test_endpoint_epsilon_tolerates_tiny_float_mismatch():
    a = [[(0.0, 0.0), (10.0, 0.0)]]
    b = [[(10.0000001, 0.0), (10.0, 10.0)]]
    pieces = group_into_pieces(a + b)
    assert len(pieces) == 1
