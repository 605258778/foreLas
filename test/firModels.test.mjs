import { test } from "node:test";
import assert from "node:assert/strict";
import { FIR_VOLUME_MODELS, FIR_DBH_MODEL, applyFirModel } from "../src/firModels.js";

const [central, general] = FIR_VOLUME_MODELS;

test("Chinese fir regional formulas match DB52/T 702-2011 tables", () => {
  for (const [model, d, h, expected] of [
    [central, 4, 2, "0.0021"], [central, 20, 20, "0.3441"],
    [central, 30, 20, "0.7054"], [central, 58, 30, "3.4444"],
    [general, 4, 2, "0.0022"], [general, 20, 20, "0.3341"],
    [general, 30, 20, "0.6957"], [general, 56, 32, "3.5500"]
  ]) assert.equal(model.volumeFn(d, h).toFixed(4), expected, `${model.id} D=${d} H=${h}`);
});

test("Chinese fir volume rejects missing or invalid diameter and height", () => {
  for (const model of FIR_VOLUME_MODELS) for (const value of [undefined, null, "", 0, -1, NaN, Infinity]) {
    assert.ok(Number.isNaN(model.volumeFn(value, 20)));
    assert.ok(Number.isNaN(model.volumeFn(20, value)));
  }
});

test("fir crown model uses the published full-precision coefficients and cm/m units", () => {
  assert.ok(Math.abs(FIR_DBH_MODEL.fn(20, 3) - 15.3993) < 1e-10);
  assert.ok(Math.abs(FIR_DBH_MODEL.fn(20, 4) - 19.7921) < 1e-10);
  assert.equal(FIR_DBH_MODEL.fn(10, 3), FIR_DBH_MODEL.fn(30, 3), "height is not a predictor in this equation");
});

test("applying fir uses mean crown width and leaves manual references independent", () => {
  const tree = { h: 20, cd: 8, cdBbox: 3, dbhManual: "", hManual: "", cdManual: "" };
  const result = applyFirModel(tree);
  assert.equal(result.dbhModel, FIR_DBH_MODEL.fn(20, 3));
  assert.equal(result.modelId, FIR_DBH_MODEL.id);
  const withManual = applyFirModel({ ...tree, dbhManual: "50", hManual: "30", cdManual: "10" });
  assert.equal(withManual.dbhModel, result.dbhModel);
  assert.equal(withManual.dbhManual, "50");
  assert.equal(applyFirModel({ h: 20, cd: 3 }).dbhModel, result.dbhModel);
});

test("fir model rejects invalid widths and marks extrapolation without fabricating calibration", () => {
  for (const c of [undefined, null, "", 0, -1, Infinity, NaN]) {
    assert.equal(applyFirModel({ h: 20, cd: c }).dbhModel, null);
  }
  for (const c of [2.17, 3, 4.73]) assert.equal(applyFirModel({ cd: c }).dbhExtrapolated, false);
  for (const c of [1, 5]) assert.equal(applyFirModel({ cd: c }).dbhExtrapolated, true);
});

test("switching from a different species to fir removes stale outputs but preserves measurements", () => {
  const result = applyFirModel({ h: 20, cdBbox: 3, dbhManual: "18", dbhModel: 99,
    bm_total: 100, volume: 1, volumeModelId: "old", species: "old" });
  assert.equal(result.dbhModel, FIR_DBH_MODEL.fn(20, 3));
  assert.equal(result.dbhManual, "18");
  assert.equal(result.species, FIR_DBH_MODEL.name);
  assert.equal(result.bm_total, undefined);
  assert.equal(result.volume, undefined);
});
