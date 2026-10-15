import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIZHOU_MODELS, applyGuizhouModel, clearModelResults, estimateMassonianaVolume } from "../src/guizhouModels.js";

const [central, general] = GUIZHOU_MODELS;

test("Guizhou formulas match DB52/T 703-2011 table entries to four decimal places", () => {
  // Standard tables 1 and 2: independently published volumes, D in cm and H in m.
  for (const [model, d, h, expected] of [
    [central, 4, 2, "0.0022"], [central, 8, 20, "0.0585"],
    [central, 20, 20, "0.3210"], [central, 30, 20, "0.6784"],
    [general, 4, 2, "0.0022"], [general, 8, 20, "0.0571"],
    [general, 20, 20, "0.3210"], [general, 30, 20, "0.6790"]
  ]) assert.equal(model.volumeFn(d, h).toFixed(4), expected, `${model.id} D=${d} H=${h}`);
});

test("both regional DBH estimates reproduce the paper M2 target volume", () => {
  for (const model of GUIZHOU_MODELS) {
    for (const h of [8.6, 20, 32.3]) for (const c of [1.2, 6.12, 14.8]) {
      const d = model.fn(h, c);
      assert.ok(Number.isFinite(d) && d >= 4 && d <= 66);
      assert.ok(Math.abs(model.volumeFn(d, h) - estimateMassonianaVolume(h, c)) < 1e-9);
    }
  }
  assert.notEqual(central.fn(20, 4), general.fn(20, 4));
});

test("DBH uses automatic height and mean EW/NS crown width independently of manual references", () => {
  const tree = { h: 20, cd: 12, cdBbox: 4, hManual: "", dbhManual: "", cdManual: "" };
  const first = applyGuizhouModel(tree, central);
  assert.equal(first.dbhModel, central.fn(20, 4));
  const edited = applyGuizhouModel({ ...tree, hManual: "30", dbhManual: "50", cdManual: "10" }, central);
  assert.equal(edited.dbhModel, first.dbhModel);
  assert.equal(edited.dbhManual, "50");
  assert.equal(applyGuizhouModel({ h: 20, cd: 4 }, central).dbhModel, first.dbhModel);
});

test("invalid inputs and impossible diameter solutions stay blank instead of clamping", () => {
  for (const value of [undefined, null, "", 0, -1, Infinity, NaN]) {
    assert.equal(applyGuizhouModel({ h: value, cd: 4 }, general).dbhModel, null);
    assert.equal(applyGuizhouModel({ h: 20, cd: value }, general).dbhModel, null);
  }
  assert.equal(applyGuizhouModel({ h: 1000, cd: 4 }, general).dbhModel, null);
  assert.equal(applyGuizhouModel({ h: 1.3, cd: 4 }, general).dbhModel, null);
});

test("changing regions updates DBH and clears previous volume and biomass results", () => {
  const tree = { id: 1, h: 20, cd: 4, dbhManual: "", hManual: "", cdManual: "" };
  const first = applyGuizhouModel({ ...tree, volume: 1, volumeModelId: "old", bm_total: 20 }, central);
  const updated = applyGuizhouModel(first, general);
  assert.equal(updated.dbhModel, general.fn(20, 4));
  assert.equal(updated.species, general.name);
  assert.equal(updated.volume, undefined);
  assert.equal(updated.bm_total, undefined);
  assert.deepEqual(clearModelResults(updated), tree);
});

test("estimates outside the paper sample envelope are marked as extrapolation", () => {
  assert.equal(applyGuizhouModel({ h: 20, cd: 4 }, general).dbhExtrapolated, false);
  const result = applyGuizhouModel({ h: 35, cd: 4 }, general);
  assert.ok(result.dbhModel > 0);
  assert.equal(result.dbhExtrapolated, true);
});
