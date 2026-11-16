import json

import pytest

from ascendant.ingest import aa_pages

MODEL_ID = "fef6625d-9097-45f6-95c0-bcaa06e3d8e1"


def _page(*chunks: object) -> str:
    """A page whose RSC payload pushes the given chunks, as AA ships them."""
    pushes = "".join(
        f"self.__next_f.push([1,{json.dumps(chunk if isinstance(chunk, str) else json.dumps(chunk))}])"
        for chunk in chunks
    )
    return f"<html><script>{pushes}</script></html>"


def _model(name="Qwen4 Max", release="qwen4-max", suffix=None, id=MODEL_ID):
    return {"id": id, "release": {"slug": release, "name": name}, "name": name,
            "shortName": name, "suffix": suffix, "deprecated": False,
            "intelligenceIndex": 42.89}


def _release(name="Qwen4 Max", slug="qwen4-max"):
    return {"slug": slug, "name": name, "deprecated": False, "releaseDate": "2026-11-16",
            "modelNames": [], "creator": {"slug": "alibaba", "name": "Alibaba", "logo": None}}


def test_extract_reads_current_payload_shape():
    board = aa_pages.extract(_page(
        _model(), _release(), "Artificial Analysis Intelligence Index v5.0.1"))
    assert board["index_version"] == "5.0.1"
    assert [m["id"] for m in board["models"]] == [MODEL_ID]
    assert [r["slug"] for r in board["releases"]] == ["qwen4-max"]


def test_extract_ignores_id_objects_that_are_not_models():
    board = aa_pages.extract(_page(
        {"id": "nav", "name": "navigation"}, _model(), _release(),
        "Artificial Analysis Intelligence Index v5.0.1"))
    assert len(board["models"]) == 1


def test_extract_rejects_payload_without_models():
    with pytest.raises(RuntimeError, match="no model objects"):
        aa_pages.extract(_page(_release(), "Artificial Analysis Intelligence Index v5.0.1"))


def test_extract_rejects_ambiguous_index_version():
    with pytest.raises(RuntimeError, match="Index version"):
        aa_pages.extract(_page(
            _model(), _release(), "Artificial Analysis Intelligence Index v5.0.1",
            "Artificial Analysis Intelligence Index v4.0"))


def test_attach_slugs_takes_the_slug_from_the_api_row_with_the_same_id():
    board = aa_pages.attach_slugs(
        {"models": [_model()], "releases": [_release()]},
        [{"id": MODEL_ID, "slug": "qwen4-max"}])
    assert [m["slug"] for m in board["models"]] == ["qwen4-max"]
    assert board["release_of"] == {"qwen4-max": "qwen4-max"}


def test_attach_slugs_maps_a_variant_to_its_release():
    board = aa_pages.attach_slugs(
        {"models": [_model(name="GPT-6.1 Sol (High)", release="gpt-6-1-sol", suffix="High")],
         "releases": []},
        [{"id": MODEL_ID, "slug": "gpt-6-1-sol-high"}])
    assert board["release_of"] == {"gpt-6-1-sol-high": "gpt-6-1-sol"}


def test_attach_slugs_falls_back_to_release_slug_for_page_only_models():
    board = aa_pages.attach_slugs({"models": [_model()], "releases": []}, [])
    assert [m["slug"] for m in board["models"]] == ["qwen4-max"]


def test_attach_slugs_appends_suffix_for_page_only_variants():
    board = aa_pages.attach_slugs(
        {"models": [_model(name="DeepSeek V4 Pro (High)", release="deepseek-v4-pro",
                           suffix="High")], "releases": []}, [])
    assert [m["slug"] for m in board["models"]] == ["deepseek-v4-pro-high"]


def test_attach_slugs_keeps_colliding_page_rows_addressable():
    board = aa_pages.attach_slugs(
        {"models": [_model(id="aaaa1111-1", name="Nova 2.0 Omni (Medium)"),
                    _model(id="bbbb2222-2", name="Nova 2.0 Omni (Medium)")],
         "releases": []},
        [{"id": "aaaa1111-1", "slug": "nova-2-0-omni"},
         {"id": "bbbb2222-2", "slug": "nova-2-0-omni"}])
    assert [m["slug"] for m in board["models"]] == [
        "nova-2-0-omni", "nova-2-0-omni-bbbb2222"]
