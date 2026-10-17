import pytest

from ascendant.ingest.snapshot import backfill, check_coverage


def _api(n: int) -> dict:
    return {"data": [{"slug": f"m{i}"} for i in range(n)]}


def _board(n: int) -> dict:
    return {"models": [{"slug": f"m{i}"} for i in range(n)]}


def test_full_coverage_passes():
    check_coverage(_api(704), _board(704))


def test_minor_gap_passes():
    check_coverage(_api(704), _board(700))


def test_partial_payload_fails():
    with pytest.raises(RuntimeError, match="273/704"):
        check_coverage(_api(704), _board(273))


def test_board_slugs_outside_api_do_not_count():
    board = {"models": [{"slug": f"x{i}"} for i in range(704)]}
    with pytest.raises(RuntimeError, match="0/704"):
        check_coverage(_api(704), board)


def test_empty_api_fails():
    with pytest.raises(RuntimeError, match="no models"):
        check_coverage(_api(0), _board(0))


def test_backfill_carries_missing_models_as_deprecated():
    api = _api(4)
    board = {"models": [{"slug": "m0", "deprecated": False}], "release_of": {}}
    prior = {"models": [{"slug": "m1", "deprecated": False, "modelCreatorColor": "#123456"},
                        {"slug": "m2", "deprecated": True}, {"slug": "gone"}]}
    out = backfill(api, board, prior)
    assert out["carried"] == ["m1", "m2"]
    assert [m["slug"] for m in out["models"]] == ["m0", "m1", "m2"]
    assert all(m["deprecated"] for m in out["models"][1:])
    assert out["models"][1]["modelCreatorColor"] == "#123456"
    assert out["release_of"] == {}
    assert prior["models"][0]["deprecated"] is False  # prior left untouched


def test_backfill_prefers_page_objects_and_handles_no_prior():
    board = {"models": [{"slug": "m0", "deprecated": False}]}
    out = backfill(_api(1), board, {"models": [{"slug": "m0", "deprecated": True}]})
    assert out["carried"] == [] and out["models"][0]["deprecated"] is False
    assert backfill(_api(2), board, None)["carried"] == []
