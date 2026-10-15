import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMON_SPECIES_MODELS, applyCommonSpeciesModel } from "../src/commonSpeciesModels.js";

test("verified height curves invert published diameter examples in cm", () => {
  const references = [
    ["pa_height_qin2019", 61.73, 4922.05, 79.88],
    ["py_height_qin2019", 50.69, 2522.02, 47.72]
  ];
  for (const [id, a, b, c] of references) {
    const model = COMMON_SPECIES_MODELS.find(m => m.id === id);
    for (const d of [10, 20, 30]) {
      const h = a - b / (d + c);
      assert.ok(Math.abs(model.fn(h) - d) < 1e-10);
    }
  }
});

test("height curve inversions reject invalid heights and out-of-range inferred diameters", () => {
  for (const model of COMMON_SPECIES_MODELS.filter(m => m.available)) {
    for (const h of [null, undefined, "15", NaN, Infinity, -1, model.hMin - 0.1, model.hMax + 0.1, model.hMax]) {
      assert.ok(Number.isNaN(model.fn(h)), `${model.id}: ${h}`);
    }
    const result = applyCommonSpeciesModel({ h: model.hMax, dbhModel: 20 }, model);
    assert.equal(result.dbhModel, null);
    assert.match(result.dbhStatus, /超出/);
  }
});

test("unsupported species clear old predictions and retain independent measurements", () => {
  const pending = COMMON_SPECIES_MODELS.filter(m => !m.available);
  assert.equal(pending.length, 3);
  for (const model of pending) {
    assert.ok(model.volumeModel, "each species retains its separately sourced volume equation");
    const original = { h: 15, cd: 4, dbhModel: 30, dbhActual: 22, hActual: 14,
      cdActual: 3.8, bm_total: 100, volume: 0.8, dbhExtrapolated: true };
    const result = applyCommonSpeciesModel(original, model);
    assert.equal(result.dbhModel, null);
    assert.match(result.dbhStatus, /缺少/);
    assert.equal(result.dbhActual, 22);
    assert.equal(result.hActual, 14);
    assert.equal(result.cdActual, 3.8);
    assert.equal(result.bm_total, undefined);
    assert.equal(result.volume, undefined);
    assert.equal(result.dbhExtrapolated, false);
    assert.equal(original.dbhModel, 30);
  }
});

test("supported species apply height-only estimates without using manual reference measurements", () => {
  for (const model of COMMON_SPECIES_MODELS.filter(m => m.available)) {
    const result = applyCommonSpeciesModel({ h: 15, dbhActual: 999, hActual: 100 }, model);
    assert.equal(result.dbhModel, model.fn(15));
    assert.equal(result.dbhActual, 999);
    assert.match(result.dbhStatus, /未在贵州校准/);
  }
});
