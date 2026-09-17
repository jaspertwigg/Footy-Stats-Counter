from leathercraft_pdf.pieces import Piece, is_irregular_shape


def test_plain_rectangle_is_not_irregular():
    rect = Piece(
        polylines=[
            [(0, 0), (100, 0)],
            [(100, 0), (100, 50)],
            [(100, 50), (0, 50)],
            [(0, 50), (0, 0)],
        ],
        bbox=(0, 0, 100, 50),
    )
    assert is_irregular_shape(rect) is False


def test_rectangle_with_a_short_fold_mark_tick_is_still_regular():
    # The tick is a real extra edge but far shorter than 20% of the
    # smaller bbox dimension, so it shouldn't trip the detector.
    rect_with_tick = Piece(
        polylines=[
            [(0, 0), (100, 0)],
            [(100, 0), (100, 50)],
            [(100, 50), (0, 50)],
            [(0, 50), (0, 0)],
            [(50, 50), (50, 55)],  # 5mm tick, bbox min dim is 50mm
        ],
        bbox=(0, 0, 100, 50),
    )
    assert is_irregular_shape(rect_with_tick) is False


def test_trapezoid_with_a_slanted_side_is_irregular():
    # One corner cut at an angle -- a substantial edge that's neither the
    # bbox width nor height.
    trapezoid = Piece(
        polylines=[
            [(0, 0), (100, 0)],
            [(100, 0), (100, 40)],
            [(100, 40), (80, 50)],  # slanted edge, ~22.4mm
            [(80, 50), (0, 50)],
            [(0, 50), (0, 0)],
        ],
        bbox=(0, 0, 100, 50),
    )
    assert is_irregular_shape(trapezoid) is True


def test_two_same_bbox_pieces_can_disagree_on_irregularity():
    # This is the real-world case: two pieces share a bounding box but
    # aren't the same shape, so dedup keeps them separate and this helper
    # is what lets a caller tell which one is "the funny shaped one".
    plain = Piece(
        polylines=[
            [(0, 0), (100, 0)],
            [(100, 0), (100, 50)],
            [(100, 50), (0, 50)],
            [(0, 50), (0, 0)],
        ],
        bbox=(0, 0, 100, 50),
    )
    notched = Piece(
        polylines=[
            [(0, 0), (100, 0)],
            [(100, 0), (100, 35)],
            [(100, 35), (85, 50)],
            [(85, 50), (0, 50)],
            [(0, 50), (0, 0)],
        ],
        bbox=(0, 0, 100, 50),
    )
    assert is_irregular_shape(plain) is False
    assert is_irregular_shape(notched) is True
