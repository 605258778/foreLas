import {parseLAS} from "./lasParser.js";
import {gB,makeNorm,clipP,runSeg,makeMet,makeArea,exTr,customVWS,parseGeoTIFF,parseAsciiDTM,parseXYZdtm,normWithDTM} from "./analysisCore.js";
import {SP,BIOMASS} from "./speciesModels.js";
import {GUIZHOU_MODELS,applyGuizhouModel,clearModelResults} from "./guizhouModels.js";
import {FIR_DBH_MODEL,applyFirModel} from "./firModels.js";
import {COMMON_SPECIES_MODELS,applyCommonSpeciesModel} from "./commonSpeciesModels.js";
import {calculateVolumes} from "./volumeAnalysis.js";

function readFile(file,asText,progress) {
  // FileReader supplies actual bytes-read progress in the browser worker.
  if(typeof FileReader==="undefined") return asText?file.text():file.arrayBuffer();
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onprogress=e=>progress(e.lengthComputable?e.loaded/e.total*100:null,"读取本地文件");
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error("文件读取失败"));
    reader.onabort=()=>reject(new Error("文件读取已中止"));
    asText?reader.readAsText(file):reader.readAsArrayBuffer(file);
  });
}

// A persistent worker holds the analysis data; later operations need only
// parameters, avoiding another full point-cloud clone on every button click.
export function createAnalysisEngine() {
  let data=null,zN=null,clipped=null;
  const active=useClip=>useClip&&clipped?clipped:{pts:data,zN};
  return async function execute(type,p,report=()=>{}) {
    const range=(lo,hi)=>(value,stage)=>report(value===null?null:lo+value/100*(hi-lo),stage);
    if(type==="load") {
      const buf=await readFile(p.file,false,range(0,15));
      report(15,"解析 LAS 点云与属性");
      const pts=parseLAS(buf,p.samplePercent,range(15,45));
      if(!pts.n)throw new Error("文件中没有可读取的点云");
      report(45,"计算点云范围");
      const bounds=gB(pts);let normalized,notice="",useAuto=false;
      if(p.dtmSrc==="external"&&p.extDTM) {
        report(48,"核对地面模型高程");
        let dtmMin=Infinity,dtmMax=-Infinity;
        for(const v of p.extDTM.data)if(Number.isFinite(v)){dtmMin=Math.min(dtmMin,v);dtmMax=Math.max(dtmMax,v);}
        const offset=Math.abs((bounds.z0+bounds.z1)/2-(dtmMin+dtmMax)/2);
        if(offset>50){
          notice=`⚠ DTM 高程范围 (${dtmMin.toFixed(0)}–${dtmMax.toFixed(0)} m) 与 LAS 数据 (${bounds.z0.toFixed(0)}–${bounds.z1.toFixed(0)} m) 不匹配，已改用自动归一化。`;
          normalized=makeNorm(pts,2,range(50,95));useAuto=true;
        }else{normalized=normWithDTM(pts,p.extDTM,range(50,95));notice=`✓ 已使用外部 DTM 归一化（偏移 ${offset.toFixed(1)} m）`;}
      }else normalized=makeNorm(pts,2,range(50,95));
      data=pts;zN=normalized;clipped=null;
      report(97,"准备点云视图");
      return {pts,bounds,normalized,notice,useAuto};
    }
    if(type==="dtm") {
      const name=p.file.name.toLowerCase();let dtm;
      if(/\.tiff?$/.test(name)){const buf=await readFile(p.file,false,range(0,35));report(40,"解析地面栅格");dtm=await parseGeoTIFF(buf);}
      else if(/\.(asc|txt|xyz|csv)$/.test(name)){const text=await readFile(p.file,true,range(0,35));report(40,"构建地面格网");dtm=/\.(asc|txt)$/.test(name)?parseAsciiDTM(text):parseXYZdtm(text,2);}
      else throw new Error("不支持的 DTM 格式 (.tif/.asc/.txt/.xyz/.csv)");
      if(!dtm)throw new Error("DTM 解析失败");
      report(95,"准备地面模型");return dtm;
    }
    if(type==="species") {
      const model=SP.find(m=>m.id===p.sp);if(!model)throw new Error("未知树种模型");
      const common=COMMON_SPECIES_MODELS.some(m=>m.id===p.sp),fir=p.sp===FIR_DBH_MODEL.id,guizhou=GUIZHOU_MODELS.some(m=>m.id===p.sp);
      const bio=p.sp.startsWith("pb")?BIOMASS.pb:null;
      const metrics=p.metrics.map((m,i)=>{
        report(i/p.metrics.length*(p.volumeOptions?80:95),`计算胸径与林木参数 ${i+1}/${p.metrics.length}`);
        if(common)return applyCommonSpeciesModel(m,model);
        if(fir)return applyFirModel(m);
        if(guizhou)return applyGuizhouModel(m,model);
        const d=model.fn(m.h,m.cd);
        const bioOut=bio&&d>0&&m.h>0?{bm_total:bio.total(d,m.h),bm_stem:bio.stem(d,m.h),bm_branch:bio.branches(d,m.h),bm_bark:bio.bark(d,m.h),bm_needle:bio.needles(d,m.h)}:{};
        return {...clearModelResults(m),dbhModel:d,species:model.name,modelId:model.id,...bioOut};
      });
      const count=metrics.filter(m=>Number.isFinite(m.dbhModel)).length,extrapolated=metrics.filter(m=>m.dbhExtrapolated).length;
      const notice=common?(model.available?`已生成 ${count} 棵树的 DBH₁（树高曲线间接反求）；${metrics.length-count} 棵输入无效或超出样本范围，未输出。模型尚未在贵州校准。`:`${model.name}：缺少已核实的胸径预测模型，DBH₁ 保持空白。`):fir?`已生成 ${count} 棵杉木的 DBH₁（冠幅回归估算）；${metrics.length-count} 棵冠幅无效，${extrapolated} 棵超出冠幅样本范围。模型尚未在贵州校准。`:guizhou?`已生成 ${count} 棵树的 DBH₁（间接估算）；${metrics.length-count} 棵输入无效或超出求解范围，${extrapolated} 棵超出文献样本范围。`:"";
      return {metrics:p.volumeOptions?calculateVolumes(metrics,p.volumeOptions,range(80,97)):metrics,notice};
    }
    if(type==="volume") {
      if(!p.metrics?.length)throw new Error("请先完成单木分割");
      return {metrics:calculateVolumes(p.metrics,p.options,range(0,97))};
    }
    const a=active(p.useClip);if(!a.pts||!a.zN)throw new Error("请先导入点云数据");
    if(type==="clip") {
      const result=clipP(data,zN,p.x,p.y,p.radius,p.shape,range(0,90));
      if(!result.pts.x.length)throw new Error("区域内无点云！");
      report(95,"计算样地范围");const bounds=gB(result.pts);clipped=result;return {...result,bounds};
    }
    if(type==="segment") {
      if(!Number.isFinite(p.cell)||p.cell<=0||!Number.isFinite(p.radius)||p.radius<=0||!Number.isFinite(p.minHeight))throw new Error("请填写有效的格网、搜索半径和最低树高");
      const coef=p.vwsPreset==="custom"?customVWS(p.vwsCustom):null;
      const segments=runSeg(a.pts,a.zN,p.cell,p.minHeight,p.radius,p.vwsMode,p.vwsPreset,coef,range(0,55));
      report(55,"提取单木指标");
      const metrics=makeMet(a.pts,a.zN,segments.labels,segments.count,p.crownMode,range(55,97));
      return {segments,metrics};
    }
    if(type==="area")return makeArea(a.pts,a.zN,p.metrics,p.roi,range(0,97));
    if(type==="transect")return exTr(a.pts,a.zN,p.p1,p.p2,2,range(0,97));
    throw new Error("未知处理任务");
  };
}
