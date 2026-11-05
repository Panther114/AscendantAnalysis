"""Estimates Intelligence Index scores for models AA has not rescored on the current version.

Models scored on both the previous and the current version give pairs (old, new). The estimate is
new = q(old) * (1 + lab offset), with q(old) = a + b*old + c*old^2. The lab offset is the mean
*relative* residual of that lab's paired models, shrunk towards zero by n / (n + k), so a lab with
one or two pairs is barely moved. Labs are corrected because a rescore moves labs unevenly (OpenAI
up, open-weights labs down). The offset is relative, not additive: it is fitted on recent models
that score 20-60, and an additive offset of a few points would swamp (and could reorder) the
estimates of older models that map to 2-10. Estimated scores carry `estimated=True` and are never
mixed with a model's own older-version score.
"""

from __future__ import annotations

from dataclasses import dataclass

from ascendant import stats

# Pairs whose quadratic prediction is below this many points give no usable relative residual.
_MIN_BASE = 1.0


@dataclass(frozen=True)
class Bridge:
    coef: tuple[float, float, float]
    offsets: dict[str, float]  # relative: -0.05 means 5% below the quadratic map
    n: int
    rmse: float  # in-sample, index points

    def base(self, old: float) -> float:
        a, b, c = self.coef
        return a + b * old + c * old * old

    def predict(self, lab: str, old: float) -> float:
        return max(0.0, self.base(old) * (1.0 + self.offsets.get(lab, 0.0)))


def fit(pairs: list[tuple[str, str, float, float]], shrinkage: float) -> Bridge:
    """pairs: (slug, lab, old score, new score)."""
    pairs = sorted(pairs)
    coef = stats.ols([[o, o * o] for _, _, o, _ in pairs], [n for _, _, _, n in pairs])
    b = Bridge((coef[0], coef[1], coef[2]), {}, len(pairs), 0.0)
    resid: dict[str, list[float]] = {}
    for _, lab, o, n in pairs:
        q = b.base(o)
        resid.setdefault(lab, [])
        if q >= _MIN_BASE:
            resid[lab].append((n - q) / q)
    offsets = {lab: max(-1.0, sum(r) / (len(r) + shrinkage)) for lab, r in sorted(resid.items())}
    b = Bridge(b.coef, offsets, len(pairs), 0.0)
    sq = [(b.predict(lab, o) - n) ** 2 for _, lab, o, n in pairs]
    return Bridge(b.coef, offsets, len(pairs), (sum(sq) / len(sq)) ** 0.5)
