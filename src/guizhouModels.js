// Indirect DBH estimation: Tang et al. (2023), table 5 M2, followed by
// inversion of DB52/T 703-2011 sections 3.1/3.2. Not a fitted DBH model.
// D: cm; H: m; C: mean east-west/north-south crown width in m; V: m³.
export const GUIZHOU_MODELS = [
  {
    id: "pm_gz_central", name: "贵州中心产区马尾松", kind: "dbh",
    ref: "唐佳俊等（2023）M2 ＋ DB52/T 703—2011 公式（1）",
    area: "锦屏、黎平、从江、榕江、雷山、台江、剑河、天柱、丹寨、三都；适用于人工起源马尾松。",
    transferNote: "材积估算来自织金一般产区样本，迁移至中心产区反求胸径尚未经当地实测验证。",
    formula: "V = 0.000094602 × D^[1.88156 − 0.0030651(D+H)] × H^[0.76840 + 0.0046574(D+H)]",
    volumeFn: (d, h) => 0.000094602 * d ** (1.88156 - 0.0030651 * (d + h)) * h ** (0.76840 + 0.0046574 * (d + h))
  },
  {
    id: "pm_gz_general", name: "贵州一般产区马尾松", kind: "dbh",
    ref: "唐佳俊等（2023）M2 ＋ DB52/T 703—2011 公式（2）",
    area: "贵州省除中心产区上述十县以外的人工马尾松分布区域。",
    formula: "V = 0.000094147 × D^[1.93896 − 0.0042676(D+H)] × H^[0.70998 + 0.0059256(D+H)]",
    volumeFn: (d, h) => 0.000094147 * d ** (1.93896 - 0.0042676 * (d + h)) * h ** (0.70998 + 0.0059256 * (d + h))
  }
].map(model => ({ ...model, fn: (h, c) => inferMassonianaDbh(h, c, model.volumeFn) }));

export function estimateMassonianaVolume(h, c) {
  if (!Number.isFinite(h) || h <= 1.3 || !Number.isFinite(c) || c <= 0) return NaN;
  return 0.0001 * h ** 2.982 * c ** 0.007;
}

export function inferMassonianaDbh(h, c, volumeFn) {
  const target = estimateMassonianaVolume(h, c);
  if (!Number.isFinite(target) || target <= 0) return NaN;
  // Stay within the diameter span tabulated by the standard; don't clamp an
  // impossible solution to an endpoint. Both regional curves increase here.
  let lo = 4, hi = 66;
  const lowVolume = volumeFn(lo, h), highVolume = volumeFn(hi, h);
  if (!Number.isFinite(lowVolume) || !Number.isFinite(highVolume) ||
      highVolume <= lowVolume || target < lowVolume || target > highVolume) return NaN;
  for (let i = 0; i < 60; i++) {
    const d = (lo + hi) / 2;
    if (volumeFn(d, h) < target) lo = d; else hi = d;
  }
  const d = (lo + hi) / 2;
  return Math.abs(volumeFn(d, h) - target) <= Math.max(1e-10, target * 1e-8) ? d : NaN;
}

export function clearModelResults(tree) {
  const { dbhModel, dbhStatus, dbhExtrapolated, species, modelId, bm_total, bm_stem, bm_branch, bm_bark, bm_needle,
    volume, volumeModelId, volumeDbh, volumeHeight, volumeHeightSource, volumeStatus, ...rest } = tree;
  return rest;
}

export function applyGuizhouModel(tree, model) {
  // cdBbox is already the mean of EW/NS extents, matching the paper's C.
  // Manual measurements remain independent references for accuracy evaluation.
  const c = tree.cdBbox ?? tree.cd;
  const d = model.fn(tree.h, c);
  const valid = Number.isFinite(d) && d > 0;
  const extrapolated = valid && (tree.h < 8.6 || tree.h > 32.3 || c < 1.2 || c > 14.8);
  return {
    ...clearModelResults(tree), species: model.name, modelId: model.id,
    dbhModel: valid ? d : null, dbhExtrapolated: extrapolated,
    dbhStatus: !valid ? "输入无效或胸径超出 4–66 cm 求解范围" : extrapolated ? "间接估算（超出文献样本范围）" : model.transferNote ? "间接估算（一般产区模型迁移至中心产区；未校准）" : "间接估算"
  };
}
