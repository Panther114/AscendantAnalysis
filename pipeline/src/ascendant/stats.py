"""Deterministic numeric helpers.

Pure Python on purpose: no BLAS, no threading, no platform-dependent reductions.
Every function sorts or iterates in a defined order so results are bit-stable.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

ROUND_DP = 6


def rnd(x: float | None, dp: int = ROUND_DP) -> float | None:
    """Round at stage boundaries; normalises -0.0 to 0.0."""
    if x is None:
        return None
    r = round(x, dp)
    return 0.0 if r == 0 else r


def sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)
    return e / (1.0 + e)


def fsum_mean(xs: Sequence[float]) -> float:
    return math.fsum(xs) / len(xs)


def percentile(xs: Sequence[float], q: float) -> float:
    """Linear-interpolated percentile, q in [0, 100]."""
    s = sorted(xs)
    if not s:
        raise ValueError("percentile of empty sequence")
    if len(s) == 1:
        return s[0]
    pos = (len(s) - 1) * q / 100.0
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def pct_rank(value: float, population: Sequence[float]) -> float:
    """Mid-rank percentile of `value` within `population` (which includes it), in [0, 1].

    A lone entrant scores 1.0: with no rivals it is unbeaten in its slot.
    """
    n = len(population)
    if n <= 1:
        return 1.0
    below = sum(1 for p in population if p < value)
    equal = sum(1 for p in population if p == value)
    return (below + 0.5 * (equal - 1)) / (n - 1)


def ols(xs: Sequence[Sequence[float]], ys: Sequence[float]) -> list[float]:
    """Least squares with intercept via normal equations + Gauss-Jordan.

    Returns [intercept, b1, b2, ...]. Small dimensions only.
    """
    rows = [[1.0, *x] for x in xs]
    k = len(rows[0])
    a = [[math.fsum(r[i] * r[j] for r in rows) for j in range(k)] for i in range(k)]
    b = [math.fsum(r[i] * y for r, y in zip(rows, ys, strict=True)) for i in range(k)]
    m = [row[:] + [bv] for row, bv in zip(a, b, strict=True)]
    for col in range(k):
        piv = max(range(col, k), key=lambda r: (abs(m[r][col]), -r))
        if abs(m[piv][col]) < 1e-12:
            raise ValueError("singular design matrix")
        m[col], m[piv] = m[piv], m[col]
        pv = m[col][col]
        m[col] = [v / pv for v in m[col]]
        for r in range(k):
            if r != col and m[r][col] != 0.0:
                f = m[r][col]
                m[r] = [v - f * c for v, c in zip(m[r], m[col], strict=True)]
    return [m[i][k] for i in range(k)]



def jenks_breaks(values: Sequence[float], k: int) -> list[float]:
    """Fisher-Jenks natural breaks. Returns k-1 upper bounds of the lower classes.

    Exact O(k n^2) dynamic programme minimising within-class squared deviation.
    """
    data = sorted(values)
    n = len(data)
    if n < k:
        raise ValueError(f"need at least {k} values for {k} classes, got {n}")
    pre = [0.0]
    pre2 = [0.0]
    for v in data:
        pre.append(pre[-1] + v)
        pre2.append(pre2[-1] + v * v)

    def ssd(i: int, j: int) -> float:  # inclusive i..j, 0-based
        cnt = j - i + 1
        s = pre[j + 1] - pre[i]
        return (pre2[j + 1] - pre2[i]) - s * s / cnt

    inf = float("inf")
    cost = [[inf] * n for _ in range(k)]
    back = [[0] * n for _ in range(k)]
    for j in range(n):
        cost[0][j] = ssd(0, j)
    for c in range(1, k):
        for j in range(c, n):
            best, arg = inf, c
            for i in range(c, j + 1):
                v = cost[c - 1][i - 1] + ssd(i, j)
                if v < best:
                    best, arg = v, i
            cost[c][j] = best
            back[c][j] = arg
    starts = []
    j = n - 1
    for c in range(k - 1, 0, -1):
        i = back[c][j]
        starts.append(i)
        j = i - 1
    starts.reverse()
    return [data[i - 1] for i in starts]
