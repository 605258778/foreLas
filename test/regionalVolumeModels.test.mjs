import { test } from "node:test";
import assert from "node:assert/strict";
import { REGIONAL_VOLUME_MODELS } from "../src/regionalVolumeModels.js";
import { GUIZHOU_MODELS } from "../src/guizhouModels.js";
import { FIR_VOLUME_MODELS } from "../src/firModels.js";

test("new Guizhou volume equations agree with high precision reference values", () => {
  // Independent 35-digit decimal evaluation of the supplied document, D=20 cm, H=15 m.
  const expected = {
    pa_gz_volume: 0.24800392517542437, py_gz_volume: 0.25536484083746155,
    cf_gz_volume: 0.22955943567965009, soft_gz_volume: 0.23496779378526077,
    hard_gz_volume: 0.23286566619775204, pm_natural_volume: 0.21562454175062080
  };
  for (const [id, value] of Object.entries(expected)) {
    const model = REGIONAL_VOLUME_MODELS.find(m => m.id === id);
    assert.ok(model);
    assert.ok(Math.abs(model.volumeFn(20, 15) - value) < 1e-12, id);
    assert.equal(model.fn, undefined, "volume equations cannot silently pretend to predict DBH");
  }
});

test("regional fir and massoniana formulas retain their existing verified coefficients", () => {
  for (const original of [...FIR_VOLUME_MODELS, ...GUIZHOU_MODELS]) {
    const model = REGIONAL_VOLUME_MODELS.find(m => m.id === original.id || m.id === `${original.id}_volume`);
    for (const [d, h] of [[10, 8], [20, 15], [40, 25]]) {
      assert.equal(model.volumeFn(d, h), original.volumeFn(d, h));
    }
    assert.equal(model.kind, "volume");
  }
  assert.equal(new Set(REGIONAL_VOLUME_MODELS.map(m => m.id)).size, REGIONAL_VOLUME_MODELS.length);
});

test("new volume formulas require valid positive diameter and height", () => {
  for (const model of REGIONAL_VOLUME_MODELS.filter(m => m.id.endsWith('_volume') && !m.id.startsWith('pm_gz'))) {
    for (const value of [undefined, null, '', 0, -1, NaN, Infinity]) {
      assert.ok(Number.isNaN(model.volumeFn(value, 15)));
      assert.ok(Number.isNaN(model.volumeFn(20, value)));
    }
  }
});
