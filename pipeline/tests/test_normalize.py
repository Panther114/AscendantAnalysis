import datetime as dt

import pytest

from ascendant.normalize import _hex_color, _impute_deprecated_prices, product_line


@pytest.mark.parametrize(
    ("name", "line"),
    [
        ("Claude Opus 5.5", "Claude Opus"),
        ("Claude 3.5 Sonnet (Oct '24)", "Claude Sonnet"),
        ("GPT-6.1 Sol", "GPT Sol"),
        ("GPT-5.5 Instant (June 2026)", "GPT Instant"),
        ("Gemini 3.5 Flash-Lite", "Gemini Flash Lite"),
        ("Gemini 3.1 Pro Preview", "Gemini Pro"),
        ("MiMo-V2.6-Pro", "MiMo Pro"),
        ("DeepSeek V4 Pro 0813", "DeepSeek Pro"),
        ("Qwen3.8 Max (0902)", "Qwen Max"),
        ("Qwen3.8 27B", "Qwen 27B"),
        ("Qwen3.8 2.4T A95B", "Qwen 2.4T A95B"),
        ("Grok 4.7", "Grok"),
        ("GLM-5.3-Flash", "GLM Flash"),
    ],
)
def test_product_line(name, line):
    assert product_line(name) == line


def test_flash_and_flash_lite_are_distinct_lines():
    assert product_line("Gemini 3.8 Flash") != product_line("Gemini 3.5 Flash-Lite")


@pytest.mark.parametrize(
    ("raw", "hex_"),
    [
        ("#cc785c", "#cc785c"),
        ("#F0529C", "#F0529C"),
        ("#abc", "#aabbcc"),
        ("1f1f1f", "#1f1f1f"),
        ("black", "#000000"),
        (" Black ", "#000000"),
        ("not-a-color", None),
        ("", None),
        (None, None),
    ],
)
def test_hex_color(raw, hex_):
    assert _hex_color(raw) == hex_


def _row(slug, release, date, intel, blend, deprecated):
    return {"slug": slug, "name": slug, "lab": "lab", "release": release,
            "date": dt.date.fromisoformat(date), "intelligence": intel, "price_blend": blend,
            "deprecated": deprecated, "price_imputed": False}


def test_deprecated_release_takes_its_lines_price():
    meta = {"m-1": {"name": "Model 1"}, "m-2": {"name": "Model 2"}, "m-3": {"name": "Model 3"},
            "x-1": {"name": "Other 1"}}
    raw = [
        _row("m-1", "m-1", "2025-01-01", 20, 3.0, False),
        _row("m-2", "m-2", "2025-05-01", 25, None, True),   # retired, price dropped
        _row("m-3", "m-3", "2025-09-01", 30, 6.0, False),
        _row("x-1", "x-1", "2025-05-01", 25, None, False),  # never priced: left alone
    ]
    _impute_deprecated_prices(raw, meta, {})
    by = {r["slug"]: r for r in raw}
    assert by["m-2"]["price_blend"] == 3.0 and by["m-2"]["price_imputed"]
    assert by["x-1"]["price_blend"] is None and not by["x-1"]["price_imputed"]
    assert not by["m-1"]["price_imputed"]


def test_deprecated_release_falls_back_to_later_sibling():
    meta = {"m-1": {"name": "Model 1"}, "m-2": {"name": "Model 2"}}
    raw = [_row("m-1", "m-1", "2025-01-01", 20, None, True),
           _row("m-2", "m-2", "2025-06-01", 25, 4.0, False)]
    _impute_deprecated_prices(raw, meta, {})
    assert raw[0]["price_blend"] == 4.0


def _api_row(slug, intel, price=1.0):
    return {"id": slug, "slug": slug, "name": slug, "release_date": "2026-09-01",
            "evaluations": {"artificial_analysis_intelligence_index": intel},
            "model_creator": {"slug": "lab", "name": "Lab"},
            "pricing": {"price_1m_input_tokens": price, "price_1m_output_tokens": 4 * price},
            "median_output_tokens_per_second": 100}


def test_build_rejects_other_index_version():
    from ascendant import config
    from ascendant.normalize import build
    board = {"index_version": "4.0", "models": [], "releases": [], "release_of": {}}
    with pytest.raises(ValueError, match="requires v5"):
        build({"date": "2026-10-29"}, {"data": []}, board, config.load())
    with pytest.raises(ValueError, match="vunknown"):
        build({"date": "2026-10-29"}, {"data": []}, {**board, "index_version": None},
              config.load())


def test_build_drops_models_without_a_score_on_the_index_version():
    from ascendant import config
    from ascendant.normalize import build
    scored = [(f"s-{i}", 10.0 + 7 * i) for i in range(6)]
    api = {"data": [_api_row(s, v, 1.0 + (i * 7) % 5) for i, (s, v) in enumerate(scored)]
           + [_api_row("a-2", None), _api_row("a-3", None)]}
    page = [{"slug": s, "intelligenceIndexCostPerTask": 0.5 + 0.4 * ((i * 3) % 4) + 0.1 * i, "isReasoning": i % 2 == 0}
            for i, (s, _) in enumerate(scored)]
    page += [{"slug": "a-2", "intelligenceIndex": 28.0}, {"slug": "a-3"}]  # a-2 has a page score
    board = {"index_version": "5.0", "models": page, "releases": [],
             "release_of": {r["slug"]: r["slug"] for r in api["data"]}}
    u = build({"date": "2026-10-29"}, api, board, config.load())
    assert sorted(r.slug for r in u.releases) == sorted([s for s, _ in scored] + ["a-2"])
    assert u.unscored == 1 and u.index_version == "5.0"
