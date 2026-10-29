"""Snapshot rows -> Variants, Releases and Labs.

Joins the AA API (stable ids, release dates, prices) with the leaderboard payload
(cost per task, release grouping, flags, creator colors) by model slug.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import math
import re
from dataclasses import dataclass, field

from ascendant import bridge as bridge_mod
from ascendant import stats
from ascendant.config import Config


@dataclass(frozen=True)
class Variant:
    id: str
    slug: str
    name: str
    short_name: str
    lab: str
    release: str
    date: dt.date
    intelligence: float
    estimated: bool
    reasoning: bool
    open_weights: bool
    price_in: float | None
    price_out: float | None
    price_blend: float | None  # 3:1 input:output, USD per 1M tokens
    cost_per_task: float | None  # USD per Intelligence Index task
    cost_per_task_imputed: bool
    cost: float | None  # geometric mix, the cost axis used everywhere
    speed: float | None  # median output tokens/s
    price_imputed: bool = False  # deprecated and unpriced: blend taken from its product line


@dataclass(frozen=True)
class Release:
    slug: str
    name: str
    lab: str
    date: dt.date
    line: str
    variants: tuple[Variant, ...]
    open_weights: bool
    price_blend: float | None = None

    @property
    def best(self) -> Variant:
        return max(self.variants, key=lambda v: (v.intelligence, v.slug))

    @property
    def intelligence(self) -> float:
        return self.best.intelligence

    @property
    def priced(self) -> bool:
        return any(v.cost is not None for v in self.variants)


@dataclass(frozen=True)
class Lab:
    slug: str
    name: str
    color: str
    logo: str | None


@dataclass
class Universe:
    snapshot_date: dt.date
    labs: dict[str, Lab]
    releases: list[Release]  # sorted by (date, slug)
    cost_model: dict[str, float] = field(default_factory=dict)
    excluded: list[str] = field(default_factory=list)
    index_version: str = ""
    unscored: int = 0  # API models with no score on the configured Intelligence Index version
    bridged: int = 0  # of the scored ones, how many carry an estimate from the previous version
    bridge: dict[str, float] = field(default_factory=dict)


_VERSION_TOKEN = re.compile(r"^(v?\d+(\.\d+)*[a-z]?|\d{4})$", re.IGNORECASE)
_PREFIX_VERSION = re.compile(r"^([A-Za-z][A-Za-z]*?)-?v?\d+(\.\d+)*$", re.IGNORECASE)
_SIZE_TOKEN = re.compile(r"^(a?\d+(\.\d+)?[bmt]|e\d+b)$", re.IGNORECASE)
# Release-channel words that don't define a separate product line.
_CHANNEL_WORDS = {"preview", "thinking", "instruct", "reasoning", "exp", "experimental", "latest"}


def product_line(name: str) -> str:
    """'Claude Opus 5.5' -> 'Claude Opus', 'GPT-6.1 Sol' -> 'GPT Sol', 'MiMo-V2.6-Pro' -> 'MiMo Pro'.

    Version and date tokens are dropped; parameter-size tokens (27B, A3B) are kept
    because different sizes are different product lines.
    """
    base = re.sub(r"\s*\([^)]*\)", "", name).strip()
    out: list[str] = []
    for tok in re.split(r"[\s_]+", base):
        parts = tok.split("-")
        kept: list[str] = []
        for p in parts:
            if not p or p.lower() in _CHANNEL_WORDS:
                continue
            if _SIZE_TOKEN.match(p):
                kept.append(p)
            elif _VERSION_TOKEN.match(p):
                continue
            elif m := _PREFIX_VERSION.match(p):
                kept.append(m.group(1))
            else:
                # Qwen3.8 / K2 / o3 style: strip a trailing version glued to a word
                stripped = re.sub(r"(?<=[A-Za-z])\d+(\.\d+)*$", "", p)
                kept.append(stripped or p)
        if kept:
            out.append(" ".join(kept))
    return " ".join(out) or base


def _pos(x: float | None) -> float | None:
    return x if (x is not None and x > 0) else None


_HEX = re.compile(r"^#?([0-9a-f]{3}|[0-9a-f]{6})$", re.IGNORECASE)
_NAMED_COLORS = {"black": "#000000", "white": "#ffffff", "gray": "#808080", "grey": "#808080"}


def _hex_color(c: str | None) -> str | None:
    """'#ABC', 'abc123', 'black' -> '#aabbcc' style hex; None when unusable."""
    if not c:
        return None
    c = c.strip()
    if m := _HEX.match(c):
        h = m.group(1)
        return "#" + (h if len(h) == 6 else "".join(ch * 2 for ch in h))
    return _NAMED_COLORS.get(c.lower())


def _release_name_date(meta: dict, best_name: str, dates: list[dt.date]) -> tuple[str, dt.date]:
    name = meta.get("name") or re.sub(r"\s*\([^)]*\)", "", best_name).strip()
    date = dt.date.fromisoformat(meta["releaseDate"]) if meta.get("releaseDate") else None
    return name, date or min(dates)


def _impute_deprecated_prices(raw: list[dict], rel_meta: dict, line_ov: dict[str, str]) -> None:
    """Give unpriced, deprecated releases the blended price of their product line.

    AA drops the price once a model is deprecated, which would leave it untiered for its whole
    life. Such a release (every variant deprecated and unpriced) takes the release-level blend
    of the nearest priced release in its (lab, line): the closest earlier one, else the closest
    later one. Models that were never priced (not deprecated) are left alone.
    """
    groups: dict[str, list[dict]] = {}
    for r in raw:
        groups.setdefault(r["release"], []).append(r)
    info = []  # (lab, line, date, slug, blend or None, imputable)
    for rslug, rows in sorted(groups.items()):
        best = max(rows, key=lambda r: (r["intelligence"], r["slug"]))
        name, date = _release_name_date(rel_meta.get(rslug, {}), best["name"],
                                        [r["date"] for r in rows])
        blends = sorted(r["price_blend"] for r in rows if r["price_blend"])
        blend = blends[len(blends) // 2] if blends else None
        imputable = blend is None and all(r["deprecated"] for r in rows)
        info.append((rows[0]["lab"], line_ov.get(rslug) or product_line(name), date, rslug, blend,
                     imputable))
    priced: dict[tuple[str, str], list[tuple[dt.date, str, float]]] = {}
    for lab, line, date, rslug, blend, _ in info:
        if blend is not None:
            priced.setdefault((lab, line), []).append((date, rslug, blend))
    for lab, line, date, rslug, _, imputable in info:
        sibs = priced.get((lab, line))
        if not imputable or not sibs:
            continue
        before = [s for s in sibs if s[0] <= date]
        after = [s for s in sibs if s[0] > date]
        src = max(before) if before else min(after)
        for r in groups[rslug]:
            r["price_blend"] = src[2]
            r["price_imputed"] = True


def _scores(api: dict) -> dict[str, float]:
    out = {}
    for r in api["data"]:
        v = (r["evaluations"] or {}).get("artificial_analysis_intelligence_index")
        if v is not None:
            out[r["slug"]] = float(v)
    return out


def build(manifest: dict, api: dict, board: dict, cfg: Config,
          legacy_api: dict | None = None) -> Universe:
    snap_date = dt.date.fromisoformat(manifest["date"])
    aliases: dict[str, str] = cfg.labs.get("aliases") or {}
    display: dict[str, dict] = cfg.labs.get("display") or {}
    ov = cfg.overrides
    excluded_cfg = set(ov.get("exclude_releases") or [])

    want = str(cfg.m("index")["version"])
    have = str(board.get("index_version") or "unknown")
    if have.split(".")[0] != want:
        raise ValueError(
            f"snapshot {manifest['date']} uses Intelligence Index v{have}; methodology "
            f"{cfg.version} requires v{want}. Scores from different versions are not comparable."
        )

    page = {m["slug"]: m for m in board["models"]}
    rel_meta = {r["slug"]: r for r in board["releases"]}
    release_of: dict[str, str] = board["release_of"]

    # Scores on the previous index version, used only to estimate models AA has not rescored.
    bridge = None
    old_scores: dict[str, float] = {}
    icfg = cfg.m("index")
    if legacy_api is not None and icfg.get("bridge"):
        old_scores = _scores(legacy_api)
        lab_of = {r["slug"]: aliases.get(r["model_creator"]["slug"], r["model_creator"]["slug"])
                  for r in api["data"]}
        new_scores = {**{s: float(m["intelligenceIndex"]) for s, m in page.items()
                         if m.get("intelligenceIndex") is not None
                         and not m.get("deprecated")},
                      **_scores(api)}
        pairs = [(s, lab_of[s], old_scores[s], v) for s, v in new_scores.items()
                 if s in old_scores and s in lab_of]
        bridge = bridge_mod.fit(pairs, float(icfg["bridge"]["lab_shrinkage"]))

    labs: dict[str, Lab] = {}
    raw: list[dict] = []
    unscored = 0
    bridged = 0
    for row in sorted(api["data"], key=lambda r: r["id"]):
        slug = row["slug"]
        pm = page.get(slug, {})
        intel = (row["evaluations"] or {}).get("artificial_analysis_intelligence_index")
        if intel is None:
            intel = pm.get("intelligenceIndex")
        estimated = bool(pm.get("intelligenceIndexIsEstimated", False))
        bridged_row = False
        if intel is None and bridge is not None and row["slug"] in old_scores:
            creator = row["model_creator"]
            intel = bridge.predict(aliases.get(creator["slug"], creator["slug"]),
                                   old_scores[row["slug"]])
            estimated = bridged_row = True
            bridged += row.get("release_date") is not None
        if intel is None or row.get("release_date") is None:
            # AA rescores models on each Index version, and keeps no score for the ones it has
            # not re-run. An older-version score is never substituted.
            unscored += intel is None
            continue
        creator = row["model_creator"]
        lab_slug = aliases.get(creator["slug"], creator["slug"])
        # The first row seen may be missing from the leaderboard page (no color or logo), so
        # fill each field from the first row that has it rather than locking in a fallback.
        d = display.get(lab_slug, {})
        cur = labs.get(lab_slug)
        color = _hex_color(d.get("color")) or (cur.color if cur and cur.color else None) \
            or _hex_color(pm.get("modelCreatorColor"))
        labs[lab_slug] = Lab(
            slug=lab_slug,
            name=d.get("name", cur.name if cur else creator["name"]),
            color=color or "",
            logo=(cur.logo if cur else None) or pm.get("modelCreatorLogo"),
        )
        pin = _pos(row["pricing"].get("price_1m_input_tokens"))
        pout = _pos(row["pricing"].get("price_1m_output_tokens"))
        blend = (3 * pin + pout) / 4 if (pin and pout) else None
        raw.append(
            {
                "id": row["id"],
                "slug": slug,
                "name": row["name"],
                "short_name": pm.get("shortName", row["name"]),
                "lab": lab_slug,
                "release": release_of.get(slug, slug),
                "date": dt.date.fromisoformat(row["release_date"]),
                "intelligence": float(intel),
                "estimated": estimated,
                "reasoning": bool(pm.get("isReasoning", False)),
                "open_weights": bool(pm.get("isOpenWeights", False)),
                "price_in": pin,
                "price_out": pout,
                "price_blend": blend,
                # an estimated score has no measured cost per task on this version: impute it
                "cpt": None if bridged_row else _pos(pm.get("intelligenceIndexCostPerTask")),
                "speed": _pos(row.get("median_output_tokens_per_second")),
                "deprecated": bool(pm.get("deprecated", False)),
                "price_imputed": False,
            }
        )

    labs = {k: v if v.color else dataclasses.replace(v, color="#888888") for k, v in labs.items()}
    line_ov: dict[str, str] = ov.get("product_lines") or {}
    if cfg.m("tiers").get("impute_deprecated_price"):
        _impute_deprecated_prices(raw, rel_meta, line_ov)

    # Impute cost-per-task where missing: log cpt ~ log price + intelligence + reasoning.
    train = [r for r in raw if r["cpt"] and r["price_blend"] and not r["price_imputed"]]
    coef = stats.ols(
        [[math.log(r["price_blend"]), r["intelligence"], float(r["reasoning"])] for r in train],
        [math.log(r["cpt"]) for r in train],
    )
    cost_model = {
        "intercept": stats.rnd(coef[0]),
        "log_price": stats.rnd(coef[1]),
        "intelligence": stats.rnd(coef[2]),
        "reasoning": stats.rnd(coef[3]),
        "n": len(train),
    }
    wt, wp = cfg.m("cost")["w_task"], cfg.m("cost")["w_price"]
    # Median cpt/price ratio, used to impute a list price for unpriced models with a measured cpt.
    ratio = stats.percentile([r["cpt"] / r["price_blend"] for r in train], 50)
    cost_model["median_task_price_ratio"] = stats.rnd(ratio)

    variants: list[Variant] = []
    for r in raw:
        cpt, imputed = r["cpt"], False
        if cpt is None and r["price_blend"]:
            cpt = math.exp(
                coef[0]
                + coef[1] * math.log(r["price_blend"])
                + coef[2] * r["intelligence"]
                + coef[3] * float(r["reasoning"])
            )
            imputed = True
        cost = None
        if cpt:
            price = r["price_blend"] or cpt / ratio
            cost = math.exp(wt * math.log(cpt) + wp * math.log(price))
        variants.append(
            Variant(
                id=r["id"],
                slug=r["slug"],
                name=r["name"],
                short_name=r["short_name"],
                lab=r["lab"],
                release=r["release"],
                date=r["date"],
                intelligence=stats.rnd(r["intelligence"]),
                estimated=r["estimated"],
                reasoning=r["reasoning"],
                open_weights=r["open_weights"],
                price_in=r["price_in"],
                price_out=r["price_out"],
                price_blend=stats.rnd(r["price_blend"]),
                cost_per_task=stats.rnd(cpt),
                cost_per_task_imputed=imputed,
                cost=stats.rnd(cost),
                speed=stats.rnd(r["speed"]),
                price_imputed=r["price_imputed"],
            )
        )

    by_release: dict[str, list[Variant]] = {}
    for v in variants:
        by_release.setdefault(v.release, []).append(v)

    releases: list[Release] = []
    excluded: list[str] = []
    for rslug in sorted(by_release):
        vs = tuple(sorted(by_release[rslug], key=lambda v: (v.intelligence, v.slug)))
        if rslug in excluded_cfg:
            excluded.append(rslug)
            continue
        meta = rel_meta.get(rslug, {})
        name, date = _release_name_date(meta, vs[-1].name, [v.date for v in vs])
        blends = sorted(v.price_blend for v in vs if v.price_blend)
        releases.append(
            Release(
                slug=rslug,
                name=name,
                lab=vs[0].lab,
                date=date,
                line=line_ov.get(rslug) or product_line(name),
                variants=vs,
                open_weights=any(v.open_weights for v in vs),
                price_blend=blends[len(blends) // 2] if blends else None,
            )
        )
    releases.sort(key=lambda r: (r.date, r.slug))
    return Universe(
        snapshot_date=snap_date,
        labs=dict(sorted(labs.items())),
        releases=releases,
        cost_model=cost_model,
        excluded=excluded,
        index_version=have,
        unscored=unscored,
        bridged=bridged,
        bridge=({"n": bridge.n, "rmse": stats.rnd(bridge.rmse)} if bridge else {}),
    )
