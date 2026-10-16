import {REGIONAL_VOLUME_MODELS} from './regionalVolumeModels.js';

export const DBH_SOURCES = {model:'模型胸径 DBH₁',manual:'实测胸径 DBH₂',preferManual:'优先实测，空缺用模型'};
export const HEIGHT_SOURCES = {point:'点云树高 H',manual:'实测树高 H₂'};
export const AREA_SOURCES = {manual:'实测样地面积',circle:'圆形裁剪面积',rect:'矩形裁剪面积',bbox:'点云外包矩形面积'};
export const DEFAULT_VOLUME_OPTIONS = Object.freeze({modelId:'',dbhSource:'model',heightSource:'point',areaOverride:''});

function positive(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function validateVolumeOptions(options) {
  const model = REGIONAL_VOLUME_MODELS.find(m=>m.id===options?.modelId);
  if (!model) throw new Error('请选择材积模型');
  if (!Object.hasOwn(DBH_SOURCES,options.dbhSource) || !Object.hasOwn(HEIGHT_SOURCES,options.heightSource)) throw new Error('请选择有效的胸径和树高来源');
  if (options.areaOverride != null && String(options.areaOverride).trim() && !positive(options.areaOverride)) throw new Error('实测样地面积须大于 0（m²）');
  return model;
}

function volumeInputs(tree, options) {
  const hasManual = tree.dbhManual != null && String(tree.dbhManual).trim() !== '';
  const source = options.dbhSource === 'preferManual' ? (hasManual?'manual':'model') : options.dbhSource;
  const d = positive(source === 'manual' ? tree.dbhManual : tree.dbhModel);
  const h = positive(options.heightSource === 'manual' ? tree.hManual : tree.h);
  return {source,d,h};
}

export function volumeReadiness(metrics, options) {
  let diameter=0,height=0,ready=0;
  for(const tree of metrics||[]) {
    const {d,h}=volumeInputs(tree,options);
    if(d)diameter++;if(h)height++;if(d&&h)ready++;
  }
  return {total:metrics?.length||0,diameter,height,ready};
}

function treeVolume(tree, options, model) {
  const {source,d,h}=volumeInputs(tree,options);
  const volume = positive(d && h ? model.volumeFn(d,h) : NaN);
  return {...tree,volume,volumeModelId:model.id,volumeDbh:d,volumeDbhSource:source,
    volumeHeight:h,volumeHeightSource:options.heightSource,
    volumeStatus:!d?'缺少有效胸径（cm）':!h?'缺少有效树高（m）':!volume?'材积公式未返回有效正数'
      :source==='manual'?'使用实测胸径':`使用估算胸径${tree.dbhExtrapolated?'；胸径超出模型样本范围':''}${tree.dbhStatus?`；${tree.dbhStatus}`:''}`};
}

export function calculateTreeVolume(tree, options) {
  return treeVolume(tree,options,validateVolumeOptions(options));
}

export function calculateVolumes(metrics, options, progress=()=>{}) {
  const model = validateVolumeOptions(options);
  return (metrics || []).map((tree,i)=>{
    if (i % 100 === 0) progress(i/metrics.length*95,`计算单木材积 ${i+1}/${metrics.length}`);
    return treeVolume(tree,options,model);
  });
}

export function resolveVolumeArea(bounds, roi, override='') {
  if (override != null && String(override).trim()) return {area:positive(override),source:'manual'};
  if (roi && positive(roi.r) && ['circle','rect'].includes(roi.shape)) {
    return {area:positive(roi.shape==='circle'?Math.PI*roi.r**2:(2*roi.r)**2),source:roi.shape};
  }
  const dx=bounds?.x1-bounds?.x0,dy=bounds?.y1-bounds?.y0;
  return {area:positive(dx)&&positive(dy)?positive(dx*dy):null,source:'bbox'};
}

export function summarizeVolumes(metrics, bounds, roi, override='') {
  const {area,source}=resolveVolumeArea(bounds,roi,override);
  let count=0,sum=0,min=Infinity,max=-Infinity;
  for (const tree of metrics || []) {
    if (!Number.isFinite(tree.volume) || tree.volume<=0) continue;
    count++;sum+=tree.volume;min=Math.min(min,tree.volume);max=Math.max(max,tree.volume);
  }
  const total=metrics?.length||0;
  return {total,count,missing:total-count,coverage:total?count/total*100:0,
    sum:count?sum:null,mean:count?sum/count:null,min:count?min:null,max:count?max:null,
    area,areaSource:source,perHa:count&&area?sum/area*10000:null};
}

export function csvRow(cells) {
  return cells.map(value=>{
    const str=value==null || typeof value==='number'&&!Number.isFinite(value)?'':String(value);
    return /[",\r\n]/.test(str)?`"${str.replaceAll('"','""')}"`:str;
  }).join(',');
}

export function volumeSummaryEntries(summary, options) {
  const model=REGIONAL_VOLUME_MODELS.find(m=>m.id===options?.modelId);
  return [['Volume_model_id',model?.id],['Volume_model_name',model?.name],['Volume_model_reference',model?.ref],
    ['Volume_DBH_source',options?.dbhSource],['Volume_height_source',options?.heightSource],
    ['Volume_total_trees',summary.total],['Volume_valid_trees',summary.count],['Volume_missing_trees',summary.missing],
    ['Volume_coverage_pct',summary.coverage],['Volume_sum_m3',summary.sum],['Volume_mean_m3',summary.mean],
    ['Volume_min_m3',summary.min],['Volume_max_m3',summary.max],['Volume_area_m2',summary.area],
    ['Volume_area_source',summary.areaSource],['Volume_per_ha_m3',summary.perHa]];
}

export const VOLUME_COLUMNS = [['Volume_m3','volume'],['Volume_model_id','volumeModelId'],['Volume_DBH_cm','volumeDbh'],
  ['Volume_DBH_source','volumeDbhSource'],['Volume_height_m','volumeHeight'],['Volume_height_source','volumeHeightSource'],['Volume_status','volumeStatus']];

export function volumeCSV(metrics, summary, options) {
  return [csvRow(['Tree_ID',...VOLUME_COLUMNS.map(([name])=>name)]),
    ...metrics.map(m=>csvRow([m.id,...VOLUME_COLUMNS.map(([,key])=>m[key])])),
    '', 'VOLUME_SUMMARY', 'Metric,Value', ...volumeSummaryEntries(summary,options).map(csvRow)].join('\r\n');
}
