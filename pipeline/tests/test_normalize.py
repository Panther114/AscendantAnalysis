import pytest

from ascendant.normalize import _hex_color, product_line


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
