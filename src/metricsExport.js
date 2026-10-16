import {csvRow,VOLUME_COLUMNS,volumeSummaryEntries} from './volumeAnalysis.js';

const COLUMNS = [['ID','id'],['H_auto','h'],['CD_auto','cd'],['CPA','cpa'],['CD_bbox','cdBbox'],['CD_convex','cdConvex'],['CD_concave','cdConcave'],
  ['CPA_bbox','cpaBbox'],['CPA_convex','cpaConvex'],['CPA_concave','cpaConcave'],['CrownMethod','crownMethod'],['CenterX','cx'],['CenterY','cy'],
  ['DBH_model','dbhModel'],['H_manual','hManual'],['CD_manual','cdManual'],['DBH_manual','dbhManual'],['Species','species'],
  ['Biomass_total_kg','bm_total'],['Biomass_stem_kg','bm_stem'],['Biomass_branch_kg','bm_branch'],['Biomass_bark_kg','bm_bark'],['Biomass_needle_kg','bm_needle'],
  ['Points','cnt'],['DBH_model_method','modelId'],['DBH_model_status','dbhStatus'],...VOLUME_COLUMNS];

export function treeMetricsCSV(metrics, area, summary, options) {
  const rows=[csvRow(COLUMNS.map(([name])=>name)),...metrics.map(m=>csvRow(COLUMNS.map(([,key])=>m[key])))];
  if (area) rows.push('','AREA_METRICS','Metric,Value',...Object.entries(area).map(csvRow));
  if (options) rows.push('','VOLUME_SUMMARY','Metric,Value',...volumeSummaryEntries(summary,options).map(csvRow));
  return rows.join('\r\n');
}

export function areaMetricsCSV(area, summary, options) {
  return ['Metric,Value',...Object.entries(area).map(csvRow),...(options?volumeSummaryEntries(summary,options).map(csvRow):[])].join('\r\n');
}
