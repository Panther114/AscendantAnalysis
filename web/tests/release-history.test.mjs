import assert from "node:assert/strict";
import test from "node:test";

import { releaseHistory } from "../src/lib/release-history.ts";

const release = (name, lab, date) => ({ name, lab, date, tier: "mid", intelligence: 30, material: true });

test("joins the daily change without inventing missing scores and keeps same-day releases together", () => {
  const releases = {
    old: release("Old", "a", "2025-12-31"),
    first: release("First", "a", "2026-01-02"),
    second: release("Second", "a", "2026-01-02"),
    unranked: release("Unranked", "b", "2026-01-02"),
    decline: release("Decline", "a", "2026-01-03"),
    future: release("Future", "a", "2026-01-04"),
  };
  const history = {
    dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
    labs: { a: { health: [50, 52.3, 51.8] }, b: { health: [null, 40, 42] } },
  };
  const rows = releaseHistory(releases, history, { a: "Lab A", b: "Lab B" }, ["a"], "2026-01-03");
  const bySlug = Object.fromEntries(rows.map((row) => [row.slug, row]));

  assert.equal(rows.length, 5);
  assert.equal(rows[0].slug, "decline");
  assert.equal(bySlug.first.healthChange, 2.3);
  assert.equal(bySlug.second.healthChange, 2.3);
  assert.equal(bySlug.first.sameDayCount, 2);
  assert.equal(bySlug.decline.healthChange, -0.5);
  assert.equal(bySlug.old.healthChange, null);
  assert.equal(bySlug.unranked.healthChange, null);
  assert.equal(bySlug.unranked.hasLabPage, false);
});

test("does not label a multi-day gap as a one-day change", () => {
  const rows = releaseHistory(
    { gap: release("Gap", "a", "2026-01-03") },
    { dates: ["2026-01-01", "2026-01-03"], labs: { a: { health: [20, 30] } } },
    {}, [], "2026-01-03",
  );
  assert.equal(rows[0].healthChange, null);
});
