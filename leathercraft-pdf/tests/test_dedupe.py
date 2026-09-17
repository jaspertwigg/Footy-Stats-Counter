from leathercraft_pdf.pieces import Piece, dedupe_identical_pieces


def _rect(x0, y0, w, h):
    poly = [
        [(x0, y0), (x0 + w, y0)],
        [(x0 + w, y0), (x0 + w, y0 + h)],
        [(x0 + w, y0 + h), (x0, y0 + h)],
        [(x0, y0 + h), (x0, y0)],
    ]
    return Piece(polylines=poly, bbox=(x0, y0, x0 + w, y0 + h))


def _mirrored_rect_with_notch(x0, y0, w, h, notch_from_left):
    """A rectangle with one corner nudged inward, mirrored left<->right by
    `notch_from_left`. Edge lengths and bbox stay the same either way.
    """
    if notch_from_left:
        pts = [(x0, y0), (x0 + w - 5, y0), (x0 + w, y0 + 5), (x0 + w, y0 + h), (x0, y0 + h), (x0, y0)]
    else:
        pts = [(x0, y0 + 5), (x0 + 5, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h), (x0, y0 + 5)]
    return Piece(polylines=[pts], bbox=(x0, y0, x0 + w, y0 + h))


def test_two_identical_rectangles_collapse_to_one_with_cut_count_2():
    a = _rect(0, 0, 100, 50)
    b = _rect(500, 500, 100, 50)  # same size, far away -> different piece originally
    result = dedupe_identical_pieces([a, b])
    assert len(result) == 1
    assert result[0].cut_count == 2


def test_three_identical_and_two_identical_stay_in_separate_groups():
    a1, a2, a3 = _rect(0, 0, 80, 60), _rect(200, 0, 80, 60), _rect(400, 0, 80, 60)
    b1, b2 = _rect(0, 200, 30, 20), _rect(200, 200, 30, 20)
    result = dedupe_identical_pieces([a1, b1, a2, b2, a3])
    counts = sorted(p.cut_count for p in result)
    assert counts == [2, 3]


def test_different_shapes_with_same_bbox_are_not_merged():
    rect = _rect(0, 0, 100, 50)
    # A triangle with the same bounding box but very different edge lengths.
    triangle = Piece(polylines=[[(0, 0), (100, 0), (50, 50), (0, 0)]], bbox=(0, 0, 100, 50))
    result = dedupe_identical_pieces([rect, triangle])
    assert len(result) == 2
    assert all(p.cut_count == 1 for p in result)


def test_mirror_image_is_treated_as_identical():
    left = _mirrored_rect_with_notch(0, 0, 100, 50, notch_from_left=True)
    right = _mirrored_rect_with_notch(500, 0, 100, 50, notch_from_left=False)
    result = dedupe_identical_pieces([left, right])
    assert len(result) == 1
    assert result[0].cut_count == 2


def test_single_pieces_keep_cut_count_one():
    a = _rect(0, 0, 100, 50)
    b = _rect(0, 0, 30, 20)
    result = dedupe_identical_pieces([a, b])
    assert len(result) == 2
    assert all(p.cut_count == 1 for p in result)
