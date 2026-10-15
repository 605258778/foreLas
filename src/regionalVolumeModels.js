import { GUIZHOU_MODELS } from "./guizhouModels.js";
import { FIR_VOLUME_MODELS } from "./firModels.js";

// Transcribed from 贵州省常用二元材积式20250924整理.docx.
// D: breast-height diameter in cm; H: tree height in m; V: stem volume in m³.
// A volume equation does not by itself supply a DBH prediction function.
const additional = [
  {
    id: "pa_gz_volume", name: "贵州华山松", ref: "DB52/T 768—2012",
    formula: "V = 0.00011996 × D^[2.019601 − 0.0083683(D+H)] × H^[0.47225 + 0.012475(D+H)]",
    calculate: (d, h) => 0.00011996 * d ** (2.019601 - 0.0083683 * (d + h)) * h ** (0.47225 + 0.012475 * (d + h))
  },
  {
    id: "py_gz_volume", name: "贵州云南松", ref: "DB52/T 763—2012",
    formula: "V = 0.00010729 × D^[1.95029 − 0.0047643(D+H)] × H^[0.63241 + 0.0075891(D+H)]",
    calculate: (d, h) => 0.00010729 * d ** (1.95029 - 0.0047643 * (d + h)) * h ** (0.63241 + 0.0075891 * (d + h))
  },
  {
    id: "cf_gz_volume", name: "贵州柏木", ref: "DB52/T 773—2012",
    formula: "V = 0.000085626 × D^[1.9148 − 0.0045828(D+H)] × H^[0.74041 + 0.00668(D+H)]",
    calculate: (d, h) => 0.000085626 * d ** (1.9148 - 0.0045828 * (d + h)) * h ** (0.74041 + 0.00668 * (d + h))
  },
  {
    id: "soft_gz_volume", name: "贵州软阔树种组", ref: "DB52/T 822—2013",
    formula: "V = 0.000073624 × D^1.89885 × H^[0.85616 + 0.00064635(D+H)]",
    calculate: (d, h) => 0.000073624 * d ** 1.89885 * h ** (0.85616 + 0.00064635 * (d + h))
  },
  {
    id: "hard_gz_volume", name: "贵州硬阔树种组", ref: "DB52/T 826—2013",
    formula: "V = 0.000099985 × D^[1.94225 − 0.0076853(D+2H)] × H^[0.64053 + 0.014257(D+H)]",
    calculate: (d, h) => 0.000099985 * d ** (1.94225 - 0.0076853 * (d + 2 * h)) * h ** (0.64053 + 0.014257 * (d + h))
  },
  {
    id: "pm_natural_volume", name: "天然马尾松（部颁）", ref: "整理文档 · 天然起源马尾松部颁式",
    formula: "V = 0.000062341803 × D^1.8551497 × H^0.95682492",
    calculate: (d, h) => 0.000062341803 * d ** 1.8551497 * h ** 0.95682492
  }
].map(({ calculate, ...model }) => ({ ...model, kind: "volume", volumeFn: (d, h) => {
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(h) || h <= 0) return NaN;
  const result = calculate(d, h);
  return Number.isFinite(result) && result > 0 ? result : NaN;
} }));

export const REGIONAL_VOLUME_MODELS = [
  ...FIR_VOLUME_MODELS.map(model => ({ ...model, kind: "volume" })),
  ...GUIZHOU_MODELS.map(({ id, name, ref, area, formula, volumeFn }) => ({
    id: `${id}_volume`, name: `${name}（人工）`, ref: ref.includes("（1）") ? "DB52/T 703—2011 · 公式（1）" : "DB52/T 703—2011 · 公式（2）",
    area, formula, volumeFn, kind: "volume"
  })),
  ...additional
];
