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
  competitiveness: number;
}

export interface Meta {
  schema: number;
  methodology: string;
  snapshot_date: string;
  snapshot_hash: string;
  cost_model: Record<string, number>;
  counts: { releases: number; labs_ranked: number; variants: number };
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
