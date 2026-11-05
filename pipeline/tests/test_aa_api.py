import pytest

from ascendant.ingest import aa_api
from ascendant.ingest.snapshot import carry_api, check_versions


def _row(slug="m", creator=None, **kw):
    r = {
        "id": f"id-{slug}", "name": slug.upper(), "slug": slug, "release_date": "2026-01-01",
        "model_creator": creator if creator is not None else {"id": "c1", "name": "Amazon"},
        "evaluations": {"artificial_analysis_intelligence_index": 50.0},
        "pricing": {"price_1m_input_tokens": 1.0, "price_1m_output_tokens": 4.0},
        "performance": {"median_output_tokens_per_second": 99.0,
                        "median_time_to_first_token_seconds": 0.5},
    }
    return {**r, **kw}


def test_normalize_maps_v2_shape_to_pipeline_rows():
    (out,) = aa_api.normalize_v2([_row()], {"c1": "aws"})
    assert out["model_creator"] == {"id": "c1", "name": "Amazon", "slug": "aws"}
    assert out["median_output_tokens_per_second"] == 99.0
    assert out["pricing"]["price_1m_output_tokens"] == 4.0
    assert out["evaluations"]["artificial_analysis_intelligence_index"] == 50.0


def test_creator_slug_prefers_api_then_known_then_name():
    assert aa_api.creator_slug({"id": "x", "name": "N", "slug": "given"}, {"x": "old"}) == "given"
    assert aa_api.creator_slug({"id": "x", "name": "N"}, {"x": "old"}) == "old"
    assert aa_api.creator_slug({"id": "y", "name": "New Lab AI"}, {}) == "new-lab-ai"


def test_normalize_rejects_changed_format():
    bad = _row()
    del bad["pricing"]
    with pytest.raises(RuntimeError, match="format changed"):
        aa_api.normalize_v2([bad], {})
    bad = _row(evaluations={})
    with pytest.raises(RuntimeError, match="intelligence_index"):
        aa_api.normalize_v2([bad], {})


def test_key_comes_only_from_env(monkeypatch, tmp_path):
    monkeypatch.setattr(aa_api, "ROOT", tmp_path)
    monkeypatch.delenv("AA_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="not found"):
        aa_api.load_api_key()
    (tmp_path / ".env").write_text('AA_API_KEY="from-file"\n', encoding="utf-8")
    assert aa_api.load_api_key() == "from-file"
    monkeypatch.setenv("AA_API_KEY", " from-env ")
    assert aa_api.load_api_key() == "from-env"


def test_carry_api_keeps_dropped_models_and_clears_scores_across_versions():
    new = {"data": [{"slug": "a"}]}
    prior = {"data": [{"slug": "a"}, {"slug": "b", "evaluations":
                                       {"artificial_analysis_intelligence_index": 40.0}}]}
    same = carry_api(new, prior, {"index_version": "5.0.1"}, "5.0.1")
    assert same["carried"] == ["b"]
    assert same["data"][1]["evaluations"]["artificial_analysis_intelligence_index"] == 40.0
    other = carry_api(new, prior, {"index_version": "4.0"}, "5.0.1")
    assert other["data"][1]["evaluations"]["artificial_analysis_intelligence_index"] is None
    assert carry_api(new, None, None, "5")["carried"] == []


def test_version_mismatch_is_rejected():
    check_versions({"index_version": 5}, {"index_version": "5.0.1"})
    with pytest.raises(RuntimeError, match="mismatch"):
        check_versions({"index_version": 6}, {"index_version": "5.0.1"})
