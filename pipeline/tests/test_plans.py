import pytest

from ascendant import plans
from ascendant.ingest import plans_check, snapshot
from ascendant.paths import SNAPSHOTS


@pytest.mark.parametrize("name,expected", [
    ("Claude Opus 5.5 (Max, Default Fallback)", "Max"),
    ("GPT-6.1 Sol (Xhigh)", "Xhigh"),
    ("DeepSeek V4 Pro 0813 (Non-reasoning)", "Non-reasoning"),
    ("Qwen3.6 27B (Reasoning)", "Reasoning"),
    ("Qwen3.8 Max (0902)", "Default"),  # a date in parentheses is not an effort
    ("MiniMax-M3", "Default"),
])
def test_effort(name, expected):
    assert plans.effort(name) == expected


def _plan(pid, price, mult, release="r1", region="global", **kw):
    raw = {"id": pid, "provider": "P", "product": "X", "plan": pid, "region": region,
           "price_usd": price, "verified": "2026-10-18", "sources": [{"url": "https://e.x"}],
           "default_multiplier": mult, "models": [{"name": "M", "release": release}], **kw}
    return plans._plan_payload(raw, {"r1"}, 10)


def test_cheap_plans_are_ineligible():
    p = _plan("cheap", 1, 50)
    assert not p["eligible"]
    assert "under $10" in p["exclude_reason"]


def test_best_plan_takes_largest_multiplier_then_cheaper():
    rows = [{"slug": "v", "release": "r1", "cost_per_task": 2.0}]
    ps = [_plan("a", 20, 4), _plan("b", 100, 8), _plan("c", 50, 8), _plan("goat", 1, 99)]
    best = plans.best_plans(rows, ps)
    assert best["v"] == {"plan": "c", "multiplier": 8, "cost_per_task": 0.25}


def test_best_plan_discounts_low_confidence_multipliers():
    rows = [{"slug": "v", "release": "r1", "cost_per_task": 2.0}]
    # a derived x9 (worth 7.65) must not beat an official x8; it still wins once it is clearly larger
    ps = [_plan("generic", 30, 9, confidence="derived"), _plan("official", 10, 8, confidence="official")]
    assert plans.best_plans(rows, ps)["v"]["plan"] == "official"
    ps = [_plan("generic", 30, 12, confidence="derived"), _plan("official", 10, 8, confidence="official")]
    best = plans.best_plans(rows, ps)["v"]
    assert best["plan"] == "generic" and best["multiplier"] == 12  # raw figure is reported, not the discounted one


def test_plan_only_reprices_its_own_lineup():
    rows = [{"slug": "v", "release": "other", "cost_per_task": 2.0}]
    assert plans.best_plans(rows, [_plan("a", 20, 50)]) == {}


def test_plan_below_api_value_is_no_subsidy():
    rows = [{"slug": "v", "release": "r1", "cost_per_task": 2.0}]
    assert plans.best_plans(rows, [_plan("a", 20, 0.7)]) == {}
    assert plans.best_plans(rows, [_plan("a", 20, 1.0)]) == {}


def test_unknown_multiplier_is_skipped():
    rows = [{"slug": "v", "release": "r1", "cost_per_task": 2.0}]
    assert plans.best_plans(rows, [_plan("a", 20, None)]) == {}


def test_validate_catches_problems():
    errs = plans.validate({"plans": [
        {"id": "x", "provider": "P", "product": "X", "plan": "p", "region": "mars", "price_usd": 10,
         "verified": "2026-10-18", "sources": [{"url": "http://insecure"}],
         "models": [{"name": "m", "multiplier": 0}]},
    ]})
    assert any("region" in e for e in errs)
    assert any("https" in e for e in errs)
    assert any("positive" in e for e in errs)


def test_committed_plan_file_is_valid_and_matches_snapshot():
    raw = plans.load_plans()
    assert plans.validate(raw) == []
    dirs = sorted(p for p in SNAPSHOTS.iterdir() if (p / "manifest.json").exists())
    _, api, board = snapshot.load(dirs[-1])
    releases = set(board["release_of"].values()) | {m["slug"] for m in board["models"]}
    for p in raw["plans"]:
        for m in p.get("models") or []:
            if m.get("release"):
                assert m["release"] in releases, f"{p['id']}: unknown release {m['release']}"


def test_devalue_and_devforth_values():
    # devalue: every value is an index into the flat array
    payload = {"nodes": [None, {"type": "data", "data": [
        {"plans": 1},
        [2],
        {"slug": 3, "pricePerMonth": 4, "limitWindows": 7, "limitLastConfirmedAt": -1, "updatedAt": 3},
        "claude-pro",
        {"monthly": 5},
        {"amountUsd": 6},
        20,
        [8, 11],
        {"value": 9, "period": 10},
        35,
        "5h",
        {"value": 12, "period": 13},
        280,
        "7d",
    ]}]}
    data = plans_check._devalue(payload)
    v = plans_check.devforth_values(data)["claude-pro"]
    assert v["price_usd"] == 20
    assert v["monthly_value_usd"]["All"] == round(280 * plans_check.WEEKS_PER_MONTH, 2)
    assert v["multiplier"]["All"] == pytest.approx(60.875, abs=0.01)
