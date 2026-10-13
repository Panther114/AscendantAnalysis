"""Health Index scoring (Methodology v1). See config/methodology.v1.yaml for constants."""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass, field

from ascendant import stats
from ascendant.config import Config
from ascendant.field import TIERS, Field, launch_tiers
from ascendant.field import build as build_field
from ascendant.normalize import Release, Universe, Variant

# ---------------------------------------------------------------- results


@dataclass
class Lead:
    axis: str
    score: float | None  # sigmoid of margin, None when the lab can't compete on this axis
    margin: float | None
    lab_value: float | None
    rival_value: float | None
    rival_lab: str | None
    lab_variant: str | None
    weight: float


@dataclass
class TierSlot:
    tier: str
    release: str
    variant: str
    score: float
    rank: int
    of: int
    pct_intelligence: float
    pct_value: float
    pct_speed: float | None


@dataclass
class ReleasePoint:
    release: str
    date: str
    tier: str | None
    competitiveness: float
    material: bool


@dataclass
class LabScore:
    lab: str
    health: float
    band: str
    core: float
    leadership: float
    lineup: float
    momentum: float  # multiplier M
    momentum_m: float
    momentum_slope: float
    freshness: float  # phi
    freshness_multiplier: float
    days_since_material: int | None
    last_material: str | None
    leads: list[Lead] = field(default_factory=list)
    tiers: list[TierSlot] = field(default_factory=list)
    history: list[ReleasePoint] = field(default_factory=list)


# ---------------------------------------------------------------- engine


class Engine:
    """Scores labs as of any date. Caches fields and at-release competitiveness."""

    def __init__(self, universe: Universe, cfg: Config):
        self.u = universe
        self.cfg = cfg
        self._fields: dict[dt.date, Field] = {}
        self._at_release: dict[str, tuple[float, bool, str | None]] = {}
        self.by_lab: dict[str, list[Release]] = {}
        for r in universe.releases:
            self.by_lab.setdefault(r.lab, []).append(r)
        self.tiers = launch_tiers(universe, cfg)

    def field(self, date: dt.date) -> Field:
        f = self._fields.get(date)
        if f is None:
            f = self._fields[date] = build_field(self.u, date, self.cfg, self.tiers)
        return f

    # ------------------------------------------------------------ pillar A

    def leadership(self, lab: str, f: Field) -> tuple[float, list[Lead]]:
        lc = self.cfg.m("leadership")
        mine = [v for r in f.active if r.lab == lab for v in r.variants]
        rivals = [v for r in f.active if r.lab != lab for v in r.variants]
        leads: list[Lead] = []

        def best(vs: list[Variant], key) -> Variant | None:
            vs = [v for v in vs if key(v) is not None]
            return max(vs, key=lambda v: (key(v), v.slug)) if vs else None

        def cheapest(vs: list[Variant], floor: float) -> Variant | None:
            vs = [v for v in vs if v.cost is not None and v.intelligence >= floor]
            return min(vs, key=lambda v: (v.cost, v.slug)) if vs else None

        # intelligence
        a = best(mine, lambda v: v.intelligence)
        b = best(rivals, lambda v: v.intelligence)
        if a and b:
            m = a.intelligence - b.intelligence
            leads.append(
                Lead("intelligence", stats.sigmoid(m / lc["tau_intelligence"]), m,
                     a.intelligence, b.intelligence, b.lab, a.slug, 1.0)
            )
        else:
            leads.append(Lead("intelligence", None, None, None, None, None, None, 1.0))

        top_i = f.frontier_intelligence

        def cost_lead(axis: str, floor: float) -> Lead:
            a = cheapest(mine, floor)
            if a is None:
                return Lead(axis, None, None, None, None, None, None, 1.0)
            b = cheapest(rivals, floor)
            if b is None:  # nobody else reaches this level at any price
                return Lead(axis, 1.0, None, a.cost, None, None, a.slug, 1.0)
            m = math.log(b.cost / a.cost)
            return Lead(axis, stats.sigmoid(m / lc["tau_log_cost"]), m, a.cost, b.cost, b.lab,
                        a.slug, 1.0)

        def zone_lead(axis: str, zone: list[float]) -> Lead:
            """Frontier ownership over a zone of capability levels; detail = strongest level."""
            lo, hi = zone
            n = round((hi - lo) / lc["level_step"]) + 1
            per = [cost_lead(axis, top_i - (lo + i * lc["level_step"])) for i in range(n)]
            reached = [e for e in per if e.score is not None]
            if not reached:
                return Lead(axis, None, None, None, None, None, None, 1.0)
            top = max(reached, key=lambda e: (e.score, -(e.lab_value or 0.0)))
            score = math.fsum(e.score for e in reached) / n
            return Lead(axis, score, top.margin, top.lab_value, top.rival_value, top.rival_lab,
                        top.lab_variant, 1.0)

        leads.append(zone_lead("efficiency", lc["efficiency_zone"]))
        leads.append(zone_lead("value", lc["value_zone"]))

        floor = top_i - lc["speed_gap"]

        def fastest(vs: list[Variant]) -> Variant | None:
            vs = [v for v in vs if v.speed is not None and v.intelligence >= floor]
            return max(vs, key=lambda v: (v.speed, v.slug)) if vs else None

        a, b = fastest(mine), fastest(rivals)
        w = lc["speed_weight"]
        if a and b:
            m = math.log(a.speed / b.speed)
            leads.append(Lead("speed", stats.sigmoid(m / lc["tau_speed"]), m, a.speed, b.speed,
                              b.lab, a.slug, w))
        elif a:
            leads.append(Lead("speed", 1.0, None, a.speed, None, None, a.slug, w))
        else:
            leads.append(Lead("speed", None, None, None, None, None, None, w))

        scored = [ld for ld in leads if ld.score is not None]
        if not scored:
            return 0.0, leads
        mx = max(ld.score for ld in scored)
        mean = math.fsum((ld.score or 0.0) * ld.weight for ld in leads) / math.fsum(
            ld.weight for ld in leads
        )
        mw = lc["max_weight"]
        return mw * mx + (1 - mw) * mean, leads

    # ------------------------------------------------------------ pillar B

    def _tier_entries(
        self, f: Field, tier: str, force: Release | None = None
    ) -> list[tuple[Release, Variant, float, float | None]]:
        """Each lab's best release in a tier: (release, best variant, value residual, speed residual).

        `force` makes that release its lab's entry (to score a release that isn't the lab's best).
        """
        best_by_lab: dict[str, Release] = {}
        for r in f.active:
            if f.tier.get(r.slug) != tier:
                continue
            cur = best_by_lab.get(r.lab)
            if cur is None or (r.intelligence, r.slug) > (cur.intelligence, cur.slug):
                best_by_lab[r.lab] = r
        if force is not None:
            best_by_lab[force.lab] = force
        out = []
        for lab in sorted(best_by_lab):
            r = best_by_lab[lab]
            vals = [x for x in (f.value_residual(v) for v in r.variants) if x is not None]
            spds = [x for x in (f.speed_residual(v) for v in r.variants) if x is not None]
            out.append((r, r.best, max(vals) if vals else -math.inf, max(spds) if spds else None))
        return out

    def tier_scores(self, f: Field, tier: str, force: Release | None = None) -> dict[str, TierSlot]:
        """Per-lab slot in a tier. Unless `force` is given, a lab is represented by whichever of
        its active releases in the tier scores best (rivals held at their most capable release),
        so adding a release can never lower its lab's slot."""
        slots = self._tier_slots(f, tier, force)
        if force is not None:
            return slots
        cands: dict[str, list[Release]] = {}
        for r in f.active:
            if f.tier.get(r.slug) == tier:
                cands.setdefault(r.lab, []).append(r)
        for lab, rs in sorted(cands.items()):
            for r in rs:
                if len(rs) < 2 or r.slug == slots[lab].release:
                    continue
                alt = self._tier_slots(f, tier, r)[lab]
                if (alt.score, alt.release) > (slots[lab].score, slots[lab].release):
                    slots[lab] = alt
        ranked = sorted(slots.values(), key=lambda t: (-t.score, t.release))
        for i, t in enumerate(ranked, 1):
            t.rank = i
        return slots

    def _tier_slots(self, f: Field, tier: str, force: Release | None = None) -> dict[str, TierSlot]:
        lc = self.cfg.m("lineup")
        entries = self._tier_entries(f, tier, force)
        if not entries:
            return {}
        intel_pop = [e[1].intelligence for e in entries]
        value_pop = [e[2] for e in entries]
        speed_pop = [e[3] for e in entries if e[3] is not None]
        slots: dict[str, TierSlot] = {}
        for r, v, val, spd in entries:
            pi = stats.pct_rank(v.intelligence, intel_pop)
            pv = stats.pct_rank(val, value_pop)
            ps = stats.pct_rank(spd, speed_pop) if spd is not None else None
            wi, wv, ws = lc["w_intelligence"], lc["w_value"], lc["w_speed"]
            if ps is None:
                score = (wi * pi + wv * pv) / (wi + wv)
            else:
                score = wi * pi + wv * pv + ws * ps
            slots[r.lab] = TierSlot(tier, r.slug, v.slug, score, 0, len(entries), pi, pv, ps)
        ranked = sorted(slots.values(), key=lambda s: (-s.score, s.release))
        for i, s in enumerate(ranked, 1):
            s.rank = i
        return slots

    def lineup(self, lab: str, f: Field) -> tuple[float, list[TierSlot]]:
        slots = [s for t in TIERS if (s := self.tier_scores(f, t).get(lab))]
        if not slots:
            return 0.0, slots
        mw = self.cfg.m("lineup")["max_weight"]
        best = max(s.score for s in slots)
        mean = math.fsum(s.score for s in slots) / len(TIERS)
        return mw * best + (1 - mw) * mean, slots

    # ------------------------------------------------------------ momentum / freshness

    def at_release(self, r: Release) -> tuple[float, bool, str | None]:
        """(competitiveness in [0,1], material?, tier) of a release on its release date."""
        hit = self._at_release.get(r.slug)
        if hit is not None:
            return hit
        f = self.field(r.date)
        tier = f.tier.get(r.slug)
        gap = self.cfg.m("freshness")["material_frontier_gap"]
        if r.slug not in {x.slug for x in f.active}:  # superseded same day / below min
            res = (0.0, False, tier)
        elif tier is not None:
            comp = self.tier_scores(f, tier, force=r)[r.lab].score
            peers = [x.intelligence for x in f.active if f.tier.get(x.slug) == tier]
            prev_best = max(
                (x.intelligence for x in self.by_lab[r.lab]
                 if x.date < r.date and self.tiers.get(x.slug) == tier),
                default=-math.inf,
            )
            material = r.intelligence > prev_best or r.intelligence >= max(peers) - gap
            res = (comp, material, tier)
        else:
            pop = [x.intelligence for x in f.active]
            comp = stats.pct_rank(r.intelligence, pop)
            prev_best = max((x.intelligence for x in self.by_lab[r.lab] if x.date < r.date),
                            default=-math.inf)
            material = r.intelligence > prev_best or r.intelligence >= max(pop) - gap
            res = (comp, material, None)
        self._at_release[r.slug] = res
        return res

    def momentum(self, lab: str, date: dt.date) -> tuple[float, float, float, list[ReleasePoint]]:
        mc = self.cfg.m("momentum")
        hist: list[ReleasePoint] = []
        for r in self.by_lab.get(lab, []):
            if r.date > date:
                break
            comp, material, tier = self.at_release(r)
            hist.append(ReleasePoint(r.slug, r.date.isoformat(), tier, stats.rnd(comp), material))
        mats = [(r, p) for r, p in zip(self.by_lab.get(lab, []), hist, strict=False) if p.material]
        if not mats:
            return mc["floor"] + mc["span"] * 0.25, 0.25, 0.0, hist
        # Successor deltas within each product line, in release order.
        last_in_line: dict[str, float] = {}
        deltas: list[tuple[Release, float]] = []
        for r, p in mats:
            prev = last_in_line.get(r.line)
            if prev is not None:
                deltas.append((r, p.competitiveness - prev))
            last_in_line[r.line] = p.competitiveness
        window = deltas[-mc["window"]:]
        if window:
            ws = [0.5 ** ((date - r.date).days / mc["recency_half_life_days"]) for r, _ in window]
            trend = math.fsum(w * d for w, (_, d) in zip(ws, window, strict=True)) / math.fsum(ws)
        else:
            trend = 0.0
        # Level = competitiveness of the newest material release in each still-active line,
        # recency weighted, so one strong flagship isn't erased by a minor side release.
        f = self.field(date)
        active = {r.slug for r in f.active}
        pts = [(r, p) for r, p in mats if r.slug in active] or [mats[-1]]
        lvl = [(r, p.competitiveness) for r, p in pts]
        lw = [0.5 ** ((date - r.date).days / mc["recency_half_life_days"]) for r, _ in lvl]
        level = math.fsum(w * c for w, (_, c) in zip(lw, lvl, strict=True)) / math.fsum(lw)
        m = 0.5 * stats.sigmoid(trend / mc["tau_trend"]) + 0.5 * level
        return mc["floor"] + mc["span"] * m, m, trend, hist

    def freshness(self, lab: str, date: dt.date) -> tuple[float, float, int | None, str | None]:
        fc = self.cfg.m("freshness")
        last = None
        for r in self.by_lab.get(lab, []):
            if r.date > date:
                break
            if self.at_release(r)[1]:
                last = r
        if last is None:
            return 0.0, fc["floor"], None, None
        d = (date - last.date).days
        phi = 1.0 if d <= fc["grace_days"] else 0.5 ** ((d - fc["grace_days"]) / fc["half_life_days"])
        return phi, fc["floor"] + (1 - fc["floor"]) * phi, d, last.slug

    # ------------------------------------------------------------ health

    def in_scope(self, lab: str, date: dt.date) -> bool:
        sc = self.cfg.m("lab_scope")
        rs = [r for r in self.by_lab.get(lab, []) if r.date <= date]
        recent = [r for r in rs if (date - r.date).days <= sc["active_window_days"]]
        if len(rs) < sc["min_releases"] or not recent:
            return False
        if sc.get("require_priced_release"):
            # A lab whose active models have no published price can't be tiered or compared on
            # cost; it stays in the field as a rival but isn't ranked.
            return any(r.priced for r in self.field(date).active if r.lab == lab)
        return True

    def band(self, health: float) -> str:
        for lo, name in self.cfg.m("bands"):
            if health >= lo:
                return name
        return self.cfg.m("bands")[-1][1]

    def score_lab(self, lab: str, date: dt.date) -> LabScore:
        f = self.field(date)
        fl, leads = self.leadership(lab, f)
        ls, slots = self.lineup(lab, f)
        mw = self.cfg.m("core")["max_weight"]
        core = mw * max(fl, ls) + (1 - mw) * (fl + ls) / 2
        M, m, slope, hist = self.momentum(lab, date)
        phi, fmult, days, last = self.freshness(lab, date)
        health = max(0.0, min(100.0, 100 * core * M * fmult))
        health = round(health, 1)
        r6 = stats.rnd
        for ld in leads:
            ld.score, ld.margin = r6(ld.score), r6(ld.margin)
            ld.lab_value, ld.rival_value = r6(ld.lab_value), r6(ld.rival_value)
        for s in slots:
            s.score, s.pct_intelligence = r6(s.score), r6(s.pct_intelligence)
            s.pct_value, s.pct_speed = r6(s.pct_value), r6(s.pct_speed)
        return LabScore(
            lab=lab, health=health, band=self.band(health), core=r6(core), leadership=r6(fl),
            lineup=r6(ls), momentum=r6(M), momentum_m=r6(m), momentum_slope=r6(slope),
            freshness=r6(phi), freshness_multiplier=r6(fmult), days_since_material=days,
            last_material=last, leads=leads, tiers=slots, history=hist,
        )

    def score_all(self, date: dt.date) -> list[LabScore]:
        labs = [lab for lab in sorted(self.by_lab) if self.in_scope(lab, date)]
        scores = [self.score_lab(lab, date) for lab in labs]
        scores.sort(key=lambda s: (-s.health, s.lab))
        return scores
