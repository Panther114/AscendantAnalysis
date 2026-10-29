"""Estimates Intelligence Index scores for models AA has not rescored on the current version.

Models scored on both the previous and the current version give pairs (old, new). The estimate is
new = a + b*old + c*old^2 + lab offset, where the lab offset is the mean residual of that lab's
paired models shrunk towards zero by n / (n + k), so a lab with one or two pairs is barely moved.
Labs are corrected because a rescore moves labs unevenly (OpenAI up, open-weights labs down).
Estimated scores carry `estimated=True` and are never mixed with a model's own older-version score.
"""

from __future__ import annotations

from dataclasses import dataclass

from ascendant import stats


@dataclass(frozen=True)
class Bridge:
    coef: tuple[float, float, float]
    offsets: dict[str, float]
    n: int
    rmse: float  # in-sample, index points

    def predict(self, lab: str, old: float) -> float:
        a, b, c = self.coef
        return max(0.0, a + b * old + c * old * old + self.offsets.get(lab, 0.0))


def fit(pairs: list[tuple[str, str, float, float]], shrinkage: float) -> Bridge:
    """pairs: (slug, lab, old score, new score)."""
    pairs = sorted(pairs)
    coef = stats.ols([[o, o * o] for _, _, o, _ in pairs], [n for _, _, _, n in pairs])
    resid: dict[str, list[float]] = {}
    for _, lab, o, n in pairs:
        resid.setdefault(lab, []).append(n - (coef[0] + coef[1] * o + coef[2] * o * o))
    offsets = {lab: sum(r) / (len(r) + shrinkage) for lab, r in sorted(resid.items())}
    b = Bridge((coef[0], coef[1], coef[2]), offsets, len(pairs), 0.0)
    sq = [(b.predict(lab, o) - n) ** 2 for _, lab, o, n in pairs]
    return Bridge(b.coef, offsets, len(pairs), (sum(sq) / len(sq)) ** 0.5)
