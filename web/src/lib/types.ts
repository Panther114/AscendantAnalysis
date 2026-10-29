export type Tier = "frontier" | "mid" | "small";
export type Band = "Ascendant" | "Contending" | "Competitive" | "Trailing" | "Peripheral";

export interface Lead {
  axis: "intelligence" | "efficiency" | "value" | "speed";
  score: number | null;
  margin: number | null;
  lab_value: number | null;
  rival_value: number | null;
  rival_lab: string | null;
  lab_variant: string | null;
  weight: number;
}

export interface TierSlot {
  tier: Tier;
  release: string;
  variant: string;
  score: number;
  rank: number;
  of: number;
  pct_intelligence: number;
  pct_value: number;
  pct_speed: number | null;
}

export interface ReleasePoint {
  release: string;
  date: string;
  tier: Tier | null;
  competitiveness: number;
  material: boolean;
}

export interface LabScore {
  lab: string;
  rank: number;
  prev_rank: number | null;
  prev_health: number | null;
  health: number;
  band: Band;
  core: number;
  leadership: number;
  lineup: number;
  momentum: number;
  momentum_m: number;
  momentum_slope: number;
  freshness: number;
  freshness_multiplier: number;
  days_since_material: number | null;
  last_material: string | null;
  leads: Lead[];
  tiers: TierSlot[];
  history: ReleasePoint[];
  prev: {
    core: number;
    leadership: number;
    lineup: number;
    momentum: number;
    freshness_multiplier: number;
  } | null;
}

export interface LabMeta {
  name: string;
  aa_color: string;
  logo: string | null;
  slot: number | null;
}

export interface History {
  dates: string[];
  labs: Record<
    string,
    {
      health: (number | null)[];
      leadership: (number | null)[];
      lineup: (number | null)[];
      momentum: (number | null)[];
      freshness: (number | null)[];
      rank: (number | null)[];
    }
  >;
}

export interface VariantOut {
  slug: string;
  name: string;
  intelligence: number;
  estimated: boolean;
  reasoning: boolean;
  cost: number | null;
  cost_per_task: number | null;
  cost_per_task_imputed: boolean;
  price_in: number | null;
  price_out: number | null;
  price_imputed: boolean; // deprecated, price taken from its product line
  speed: number | null;
  value_residual: number | null;
}

export interface ReleaseOut {
  slug: string;
  name: string;
  lab: string;
  line: string;
  date: string;
  tier: Tier | null;
  open_weights: boolean;
  price_blend: number | null;
  intelligence: number;
  variants: VariantOut[];
}

export interface TierEntry {
  lab: string;
  release: string;
  variant: string;
  score: number;
  rank: number;
  pct_intelligence: number;
  pct_value: number;
  pct_speed: number | null;
}

export interface FieldOut {
  date: string;
  frontier_intelligence: number;
  price_breaks: number[];
  value_coef: number[];
  releases: ReleaseOut[];
  tiers: Record<Tier, TierEntry[]>;
}

export interface OwnershipLevel {
  gap: number;
  level: number;
  owner: string | null;
  variant: string | null;
  cost: number | null;
  runner_up: string | null;
  runner_up_cost: number | null;
  margin: number | null;
  zone: "efficiency" | "value";
}

export interface ReleaseIndexEntry {
  name: string;
  lab: string;
  date: string;
  line: string;
  tier: Tier | null;
  intelligence: number;
  price_blend: number | null;
  price_imputed: boolean;
  open_weights: boolean;
  material: boolean;
  materiality_margin: number | null;
  competitiveness: number;
}

export interface Meta {
  schema: number;
  methodology: string;
  snapshot_date: string;
  snapshot_hash: string;
  cost_model: Record<string, number>;
  index_version: string;
  index_bridge: { n?: number; rmse?: number };
  counts: { releases: number; labs_ranked: number; variants: number; unscored_models: number; bridged_models: number };
  methodology_config: Record<string, Record<string, unknown>>;
  attribution: string;
}

export interface PerceptionRow {
  lab: string;
  note: string | null;
  checks: { check: string; expected: unknown; actual: unknown; ok: boolean; detail?: string }[];
}

export interface Sensitivity {
  labs: {
    lab: string;
    rank: number;
    rank_min: number;
    rank_max: number;
    health: number;
    health_min: number;
    health_max: number;
  }[];
  runs: { param: string; factor: number; top: string[] }[];
}

// ---------------------------------------------------------------- Cost & Plans (cost.json)

export type Effort = "Max" | "Xhigh" | "High" | "Medium" | "Low" | "Minimal" | "Reasoning" | "Non-reasoning" | "Default";

export interface CostModel {
  slug: string;
  name: string;
  release: string;
  release_name: string;
  lab: string;
  effort: Effort;
  intelligence: number;
  estimated: boolean;
  cost_per_task: number;
  price_in: number | null;
  price_out: number | null;
  open_weights: boolean;
}

export interface PlanSource {
  url: string;
  title: string;
  date: string;
  used_for?: string;
}

export interface PlanModel {
  name: string;
  release: string | null;
  in_snapshot: boolean;
  multiplier: number | null;
  basis: string | null;
  confidence: string | null;
}

export interface CodingPlan {
  id: string;
  provider: string;
  product: string;
  plan: string;
  region: "global" | "china";
  price_usd: number;
  price_local: string | null;
  billing: string | null;
  quota: string | null;
  tools: string[];
  verified: string;
  confidence: string | null;
  default_multiplier: number | null;
  default_basis: string | null;
  caveats: string | null;
  sources: PlanSource[];
  devforth: string | null;
  eligible: boolean;
  exclude_reason: string | null;
  models: PlanModel[];
}

export interface PlanCheck {
  checked: string;
  devforth: { url: string; error: string | null; plans: number };
  drift_tolerance: number;
  stale_after_days: number;
  sources: { total: number; unreachable: number };
  plans: {
    id: string;
    verified: string;
    age_days: number;
    flags: string[];
    dead_sources: string[];
    devforth?: { implied: number | null; drift?: number; class: string; confirmed: string | null; monthly_value_usd: Record<string, number> };
  }[];
}

export interface CostData {
  date: string;
  reviewed: string;
  min_price_usd: number;
  fx: Record<string, number>;
  definition: string | null;
  models: CostModel[];
  archive: CostModel[]; // retired models that still have a documented cost per task
  plans: CodingPlan[];
  best: Record<string, { plan: string; multiplier: number; cost_per_task: number }>;
  check: PlanCheck | null;
}
