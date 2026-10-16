import { clearModelResults } from "./guizhouModels.js";

// Lin Hui, Ning Xiaobo, Lü Yong (2004), section 5.1, full-precision
// coefficients. DOI: 10.11707/j.1001-7488.20040406.
// https://html.rhhz.net/linyekexue/html/20040406.htm
// Table 3: 25 trees in Zhuzhou, Hunan; image mean crown widths 2.17-4.73 m.
// C is mean NS/EW full crown width (not radius or maximum hull diameter).
export const FIR_DBH_MODEL = {
  id: "cl_crown_lin2004", name: "杉木（冠幅胸径模型）", kind: "dbh",
  ref: "林辉、宁晓波、吕勇（2004）· 林业科学 40(4):33–39",
  sourceUrl: "https://www.linyekexue.net/CN/10.11707/j.1001-7488.20040406",
  area: "模型来自湖南株洲杉木样本，尚未在贵州样地校准。",
  formula: "DBH₁ = 2.2209 + 4.3928 × C",
  crownMin: 2.17, crownMax: 4.73,
  fn: (_h, c) => {
    if (!Number.isFinite(c) || c <= 0) return NaN;
    const d = 2.2209 + 4.3928 * c;
    return Number.isFinite(d) && d > 0 ? d : NaN;
  }
};

export function applyFirModel(tree) {
  const c = tree.cdBbox ?? tree.cd;
  const d = FIR_DBH_MODEL.fn(tree.h, c);
  const valid = Number.isFinite(d) && d > 0;
  const extrapolated = valid && (c < FIR_DBH_MODEL.crownMin || c > FIR_DBH_MODEL.crownMax);
  return {
    ...clearModelResults(tree), species: FIR_DBH_MODEL.name, modelId: FIR_DBH_MODEL.id,
    dbhModel: valid ? d : null, dbhExtrapolated: extrapolated,
    dbhStatus: !valid ? "平均冠幅须为有效正数（m）" : extrapolated
      ? "冠幅回归估算（超出冠幅样本范围；未在贵州校准）" : "冠幅回归估算（未在贵州校准）"
  };
}

// DB52/T 702-2011, sections 3.1/3.2. These are volume models, not DBH
// prediction models. D must already be known in cm; H is m; V is m³.
export const FIR_VOLUME_MODELS = [
  {
    id: "cl_gz_central", name: "贵州中心产区杉木",
    ref: "DB52/T 702—2011 · 公式（1）",
    area: "锦屏、黎平、从江、榕江、雷山、台江、剑河、天柱、三都，共九县。",
    formula: "V = 0.000080597 × D^[1.96709 − 0.0059006(D+H)] × H^[0.7699 + 0.0072346(D+H)]",
    volumeFn: (d, h) => validMeasurements(d, h)
      ? 0.000080597 * d ** (1.96709 - 0.0059006 * (d + h)) * h ** (0.7699 + 0.0072346 * (d + h)) : NaN
  },
  {
    id: "cl_gz_general", name: "贵州一般产区杉木",
    ref: "DB52/T 702—2011 · 公式（2）",
    area: "贵州省除中心产区九县以外的其他杉木分布区域。",
    formula: "V = 0.000088296 × D^[1.94097 − 0.0044583(D+H)] × H^[0.76012 + 0.0056841(D+H)]",
    volumeFn: (d, h) => validMeasurements(d, h)
      ? 0.000088296 * d ** (1.94097 - 0.0044583 * (d + h)) * h ** (0.76012 + 0.0056841 * (d + h)) : NaN
  }
];

function validMeasurements(d, h) {
  return Number.isFinite(d) && d > 0 && Number.isFinite(h) && h > 0;
}
