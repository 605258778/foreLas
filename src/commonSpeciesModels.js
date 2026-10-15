import { clearModelResults } from "./guizhouModels.js";
import { REGIONAL_VOLUME_MODELS } from "./regionalVolumeModels.js";

// Qin et al. (2019), DOI 10.13466/j.cnki.lyzygl.2019.04.007.
// Table 2 model 12: H = a - b/(D+c). H in m, D in cm.
// Table 4 coefficients; table 1 modeling sample envelopes. Inversion is NOT
// an independently fitted/validated DBH regression, especially outside Yunnan.
const heightSource = "https://www.lyzygl.com.cn/CN/10.13466/j.cnki.lyzygl.2019.04.007";
export const COMMON_SPECIES_MODELS = [
  {
    id: "pa_height_qin2019", name: "华山松（树高曲线反求）", available: true,
    volumeId: "pa_gz_volume", ref: "覃阳平等（2019）· 表2模型12、表4", sourceUrl: heightSource,
    formula: "DBH₁ = 4922.05 / (61.73 − H) − 79.88",
    a: 61.73, b: 4922.05, c: 79.88, hMin: 2.8, hMax: 22.5, dMin: 5.4, dMax: 41.1
  },
  {
    id: "py_height_qin2019", name: "云南松（树高曲线反求）", available: true,
    volumeId: "py_gz_volume", ref: "覃阳平等（2019）· 表2模型12、表4", sourceUrl: heightSource,
    formula: "DBH₁ = 2522.02 / (50.69 − H) − 47.72",
    a: 50.69, b: 2522.02, c: 47.72, hMin: 2.2, hMax: 26.6, dMin: 5, dMax: 36.3
  },
  {
    id: "cf_dbh_pending", name: "柏木（胸径模型待补充）", available: false, volumeId: "cf_gz_volume",
    ref: "DB52/T 773—2012 仅为材积式；胸径预测系数未核实",
    reason: "已收录柏木材积式，但尚缺适用于当前输入的胸径预测公式。相对树高曲线还需要林分平均胸径等额外实测数据。"
  },
  {
    id: "soft_dbh_pending", name: "软阔（胸径模型待补充）", available: false, volumeId: "soft_gz_volume",
    ref: "DB52/T 822—2013 仅为材积式；胸径预测系数未核实",
    reason: "软阔是树种组；已收录材积式，但未核实适用于该组、仅用当前点云指标的胸径公式，暂不输出 DBH₁。"
  },
  {
    id: "hard_dbh_pending", name: "硬阔（胸径模型待补充）", available: false, volumeId: "hard_gz_volume",
    ref: "DB52/T 826—2013 仅为材积式；胸径预测系数未核实",
    reason: "硬阔是树种组；已收录材积式，但未核实适用于该组、仅用当前点云指标的胸径公式，暂不输出 DBH₁。"
  }
].map(model => ({ ...model, kind: "dbh", volumeModel: REGIONAL_VOLUME_MODELS.find(v => v.id === model.volumeId),
  fn: h => model.available ? invertHeightCurve(h, model) : NaN
}));

export function invertHeightCurve(h, model) {
  if (!Number.isFinite(h) || h < model.hMin || h > model.hMax || h >= model.a) return NaN;
  const d = model.b / (model.a - h) - model.c;
  return Number.isFinite(d) && d >= model.dMin && d <= model.dMax ? d : NaN;
}

export function applyCommonSpeciesModel(tree, model) {
  const d = model.fn(tree.h);
  const valid = Number.isFinite(d) && d > 0;
  return {
    ...clearModelResults(tree), species: model.name, modelId: model.id,
    dbhModel: valid ? d : null, dbhExtrapolated: false,
    dbhStatus: !model.available ? "缺少已核实的胸径模型，未输出" : !valid
      ? "输入无效或超出树高/胸径样本范围，未输出" : "树高曲线间接反求（云南样本；未在贵州校准）"
  };
}
