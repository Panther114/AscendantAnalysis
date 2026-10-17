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
