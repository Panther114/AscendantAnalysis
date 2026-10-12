"""Behavioural and property tests on a synthetic market (no network, no snapshot)."""

import datetime as dt

from conftest import D, release, universe

from ascendant.field import launch_tiers
from ascendant.scoring import Engine

TODAY = D(2026, 9, 1)


def scores(market, cfg, date=TODAY):
    return {s.lab: s for s in Engine(universe(market, date), cfg).score_all(date)}


def test_deterministic(market, cfg):
    a = [(s.lab, s.health) for s in scores(market, cfg).values()]
    b = [(s.lab, s.health) for s in scores(list(reversed(market)), cfg).values()]
    assert a == b


def test_intelligence_leader_wins_intelligence_lead(market, cfg):
    s = scores(market, cfg)
    lead = {ld.axis: ld for ld in s["alpha"].leads}["intelligence"]
    assert lead.margin == 5.0 and lead.rival_lab == "beta"
    assert lead.score > 0.5


def test_cheap_specialist_beats_its_raw_capability(market, cfg):
    s = scores(market, cfg)
    # Gamma has only one weak-ish line but owns the cheap end of the frontier.
    leads = {ld.axis: ld.score for ld in s["gamma"].leads}
    assert leads["value"] > 0.5
    assert s["gamma"].health > s["eps"].health


def test_declining_line_has_negative_trend(market, cfg):
    s = scores(market, cfg)
    assert s["delta"].momentum_slope < 0
    assert s["delta"].momentum < 1.0


def test_dominant_rival_release_never_raises_health(market, cfg):
    base = scores(market, cfg)
    killer = release("zeta-1", "zeta", D(2026, 8, 30), "Zeta",
                     [(60, 0.01)], 0.01, speed=10_000)
    after = scores([*market, killer], cfg)
    for lab, s in base.items():
        assert after[lab].health <= s.health, lab


def test_freshness_never_increases_without_releases(market, cfg):
    e = Engine(universe(market, D(2027, 6, 1)), cfg)
    prev = 2.0
    d = D(2026, 9, 1)
    while d <= D(2027, 6, 1):
        phi = e.freshness("alpha", d)[0]
        assert phi <= prev
        prev = phi
        d += dt.timedelta(days=7)


def test_launch_tiers_respect_price_order_within_lab(market, cfg):
    u = universe(market, TODAY)
    tiers = launch_tiers(u, cfg)
    order = {"small": 0, "mid": 1, "frontier": 2}
    alpha = sorted((r for r in u.releases if r.lab == "alpha"), key=lambda r: r.price_blend)
    ranks = [order[tiers[r.slug]] for r in alpha]
    assert ranks == sorted(ranks)


def test_lab_scope_requires_two_releases(market, cfg):
    solo = release("solo-1", "solo", D(2026, 8, 1), "Solo", [(30, 1.0)], 1.0)
    assert "solo" not in scores([*market, solo], cfg)


def test_lab_scope_requires_priced_model(market, cfg):
    unpriced = [
        release("ghost-1", "ghost", D(2026, 7, 1), "Ghost", [(35, None)], None),
        release("ghost-2", "ghost", D(2026, 8, 1), "Ghost Big", [(40, None)], None),
    ]
    s = scores([*market, *unpriced], cfg)
    assert "ghost" not in s
    # still a rival: its 40-point model doesn't change who leads, but the lab isn't ranked
    assert s["alpha"].health == scores(market, cfg)["alpha"].health


def test_health_bounded(market, cfg):
    for s in scores(market, cfg).values():
        assert 0.0 <= s.health <= 100.0
