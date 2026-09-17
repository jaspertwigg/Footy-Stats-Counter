from leathercraft_pdf.cli import _parse_labels


def test_parses_number_equals_text():
    labels = _parse_labels(["1=Outer Shell", "3=Extra Pocket"], total_pieces=5)
    assert labels == {1: "Outer Shell", 3: "Extra Pocket"}


def test_text_may_itself_contain_an_equals_sign():
    labels = _parse_labels(["2=Front = Back"], total_pieces=5)
    assert labels == {2: "Front = Back"}


def test_missing_equals_sign_is_rejected(capsys):
    result = _parse_labels(["oops"], total_pieces=5)
    assert result is None
    assert "expected NUM=TEXT" in capsys.readouterr().err


def test_non_numeric_piece_number_is_rejected(capsys):
    result = _parse_labels(["abc=Outer Shell"], total_pieces=5)
    assert result is None
    assert "not a piece number" in capsys.readouterr().err


def test_out_of_range_piece_number_warns_but_does_not_fail(capsys):
    labels = _parse_labels(["99=Nonexistent"], total_pieces=5)
    assert labels == {}
    assert "WARNING" in capsys.readouterr().err
