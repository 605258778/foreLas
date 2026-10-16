import {useState} from 'react';
import {REGIONAL_VOLUME_MODELS} from './regionalVolumeModels.js';
import {AREA_SOURCES,DBH_SOURCES,HEIGHT_SOURCES,resolveVolumeArea,volumeReadiness,validateVolumeOptions} from './volumeAnalysis.js';

export function VolumeSummary({summary,configured}) {
  if (!configured) return <p className="workspace-sampling-note">设置材积模型与数据来源后，开始蓄积评估。</p>;
  const fmt=(n,digits=4)=>Number.isFinite(n)?n.toFixed(digits):'—';
  return <div className="volume-summary" aria-label="蓄积评估结果">
    <div className="volume-totals"><div><small>{summary.missing?'有效树木材积合计':'样地总蓄积量'}</small><strong>{fmt(summary.sum)} <small>m³</small></strong></div><div><small>{summary.missing?'有效树木折算每公顷':'每公顷蓄积量'}</small><strong>{fmt(summary.perHa,2)} <small>m³/ha</small></strong></div></div>
    <dl>{[['参与统计',`${summary.count} / ${summary.total} 棵`],['缺失材积',`${summary.missing} 棵`],['有效比例',`${fmt(summary.coverage,1)}%`],
      ['平均单木材积',`${fmt(summary.mean)} m³`],['最小 / 最大',`${fmt(summary.min)} / ${fmt(summary.max)} m³`],
      ['统计面积',`${fmt(summary.area,2)} m²`],['面积来源',AREA_SOURCES[summary.areaSource]]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {summary.missing>0&&<p className="volume-notice">仅汇总有有效材积的树木，未对缺失树木推算；当前合计不代表完整林分蓄积量。</p>}
    {!summary.area&&<p className="volume-notice">统计面积无效，无法折算每公顷蓄积量，请填写有效的实测面积。</p>}
    {summary.areaSource==='bbox'&&<p className="workspace-sampling-note">未裁剪时使用点云外包矩形，可能包含空白区域，可填写实测样地面积。</p>}
  </div>;
}

export function VolumePanel({metrics,summary,applied,draft,onDraftChange,bounds,roi,onApply,onExport,onMetrics,onSpecies,onSegment}) {
  const {modelId,dbhSource,heightSource,areaOverride}=draft;
  const [error,setError]=useState('');
  const model=REGIONAL_VOLUME_MODELS.find(m=>m.id===modelId);
  const readiness=volumeReadiness(metrics,draft);
  const plot=resolveVolumeArea(bounds,roi,areaOverride);
  const pending=applied&&(modelId!==applied.modelId||dbhSource!==applied.dbhSource||heightSource!==applied.heightSource||areaOverride!==applied.areaOverride);
  const update=(key,value)=>{setError('');onDraftChange({...draft,[key]:value});};
  const apply=()=>{
    try {validateVolumeOptions(draft);setError('');onApply({...draft});}
    catch(e){setError(e.message);}
  };
  return <>
    <section className="workspace-control-card volume-controls"><h3>评估设置 <span className="volume-badge">{readiness.total} 棵单木</span></h3>
      {!readiness.total&&<div className="volume-empty"><b>先准备单木数据</b><p>完成单木分割后，即可配置材积模型并评估。</p><button className="volume-primary" onClick={onSegment}>前往单木分割 →</button></div>}
      <form noValidate onSubmit={e=>{e.preventDefault();apply();}}>
      <label>材积模型<select aria-label="材积模型" value={modelId} onChange={e=>update('modelId',e.target.value)}><option value="">请选择树种与产区</option>{REGIONAL_VOLUME_MODELS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      {model&&<details className="volume-model-details" key={modelId}><summary>适用产区与公式 <span>{model.ref}</span></summary>{model.area&&<p>{model.area}</p>}{model.formula&&<p>{model.formula}</p>}<p>模型批量用于当前树木，请确认树种、起源和产区相符。</p></details>}
      <label><span>胸径来源 <small>cm</small></span><select aria-label="胸径来源" value={dbhSource} onChange={e=>update('dbhSource',e.target.value)}>{Object.entries(DBH_SOURCES).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
      <label><span>树高来源 <small>m</small></span><select aria-label="树高来源" value={heightSource} onChange={e=>update('heightSource',e.target.value)}>{Object.entries(HEIGHT_SOURCES).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
      <div className="volume-readiness" aria-label="数据准备情况" aria-live="polite"><div><span>有效胸径</span><b>{readiness.diameter} / {readiness.total}</b></div><div><span>有效树高</span><b>{readiness.height} / {readiness.total}</b></div><div><span>可评估单木</span><b>{readiness.ready} 棵</b></div></div>
      {readiness.total>0&&readiness.ready<readiness.total&&<div className="volume-guidance"><p>{readiness.ready?`有 ${readiness.total-readiness.ready} 棵缺少有效输入，评估将只汇总可用树木。`:'尚无同时具备有效胸径和树高的树木。'}</p><div>{dbhSource!=='manual'&&readiness.diameter<readiness.total&&<button type="button" className="volume-link" onClick={onSpecies}>生成模型胸径 →</button>}<button type="button" className="volume-link" onClick={onMetrics}>补充实测值 →</button></div></div>}
      <label>实测样地面积（m²，可选）<input type="number" min="0" step="any" value={areaOverride} placeholder="留空采用当前范围" aria-invalid={!!error&&areaOverride!==''} onChange={e=>update('areaOverride',e.target.value)}/></label>
      <p className="volume-area-preview">{AREA_SOURCES[plot.source]} <b>{plot.area?`${plot.area.toFixed(2)} m²`:'面积无效'}</b></p>
      {error&&<p className="volume-notice" role="alert">{error}</p>}
      <div className="volume-actionbar"><button type="submit" className="volume-primary" disabled={!modelId||!readiness.ready}>{applied?'重新评估':'开始评估'}{readiness.ready?` · ${readiness.ready} 棵`:''}</button>{!modelId&&readiness.total>0&&<small>请选择与样地相符的材积模型。</small>}{modelId&&readiness.total>0&&!readiness.ready&&<small>请先生成模型胸径或补充实测值。</small>}</div>
      </form>
    </section>
    <section className="workspace-control-card volume-results"><h3>评估结果 <span className="volume-badge">{pending?'待重新评估':applied?'已评估':'等待评估'}</span></h3>
      {pending&&<div className="volume-notice"><p>参数已修改，下方为上次评估结果。</p><button className="volume-link" onClick={()=>{setError('');onDraftChange({...applied});}}>恢复上次参数</button></div>}
      {applied&&<p className="workspace-sampling-note">{REGIONAL_VOLUME_MODELS.find(m=>m.id===applied.modelId)?.name} · {DBH_SOURCES[applied.dbhSource]} · {HEIGHT_SOURCES[applied.heightSource]}</p>}
      <VolumeSummary summary={summary} configured={!!applied}/>
      {applied&&<><p className="workspace-sampling-note">实测值与已应用的胸径模型变化后自动更新；重新分割后需重新评估。使用模型胸径时，材积同样为估算值。</p><button className="volume-primary" onClick={onExport}>{pending?'导出上次评估 CSV':'导出评估结果 CSV'}</button><button className="volume-link" onClick={onMetrics}>查看单木材积明细 →</button></>}
    </section>
  </>;
}
