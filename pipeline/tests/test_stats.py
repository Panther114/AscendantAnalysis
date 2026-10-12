import math

import pytest

from ascendant import stats


def test_jenks_separates_obvious_clusters():
    data = [1, 1.1, 1.2, 5, 5.1, 5.2, 10, 10.1, 10.2]
    assert stats.jenks_breaks(data, 3) == [1.2, 5.2]


def test_jenks_needs_enough_values():
    with pytest.raises(ValueError):
        stats.jenks_breaks([1, 2], 3)


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
