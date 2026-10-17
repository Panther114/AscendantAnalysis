import math

import pytest

from ascendant import stats


def test_ols_recovers_line():
    xs = [[x] for x in range(10)]
    ys = [3 + 2 * x for x in range(10)]
    a, b = stats.ols(xs, ys)
    assert a == pytest.approx(3)
    assert b == pytest.approx(2)


def test_pct_rank_mid_rank_and_lone_entrant():
    assert stats.pct_rank(5, [5]) == 1.0
    assert stats.pct_rank(3, [1, 2, 3]) == 1.0
    assert stats.pct_rank(1, [1, 2, 3]) == 0.0
    assert stats.pct_rank(2, [1, 2, 2, 3]) == pytest.approx(0.5)


def test_sigmoid_symmetric_and_stable():
    assert stats.sigmoid(0) == 0.5
    assert stats.sigmoid(3) + stats.sigmoid(-3) == pytest.approx(1)
    assert stats.sigmoid(-1000) == 0.0
    assert stats.sigmoid(1000) == 1.0


def test_percentile_interpolates():
    assert stats.percentile([0, 10], 25) == 2.5
    assert stats.percentile([7], 90) == 7



def test_rnd_normalises_negative_zero():
    assert math.copysign(1, stats.rnd(-0.0000001)) == 1


def test_soft_win_rate_tracks_rank_for_wide_gaps():
    pop = [10.0, 20.0, 30.0]
    assert stats.soft_win_rate(30.0, pop, 1.0) > 0.99
    assert stats.soft_win_rate(10.0, pop, 1.0) < 0.01
    assert abs(stats.soft_win_rate(20.0, pop, 1.0) - 0.5) < 1e-9


def test_soft_win_rate_is_graded_for_two_entrants():
    # pct_rank makes a 1-point loss a total loss; the soft rate keeps it close to even.
    assert stats.pct_rank(49.0, [49.0, 50.0]) == 0.0
    s = stats.soft_win_rate(49.0, [49.0, 50.0], 3.0)
    assert 0.4 < s < 0.5


def test_soft_win_rate_edges():
    assert stats.soft_win_rate(5.0, [5.0], 1.0) == 1.0
    assert stats.soft_win_rate(5.0, [5.0, 5.0], 1.0) == 0.5
    assert stats.soft_win_rate(-math.inf, [-math.inf, 1.0], 1.0) == 0.0
    assert stats.soft_win_rate(1.0, [-math.inf, 1.0], 1.0) == 1.0
