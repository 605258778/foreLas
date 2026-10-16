import{useState,useRef,useEffect,useCallback,useMemo}from"react";
import*as THREE from"three";

import{GUIZHOU_MODELS}from"./guizhouModels.js";
import{FIR_DBH_MODEL}from"./firModels.js";
import{COMMON_SPECIES_MODELS}from"./commonSpeciesModels.js";


// ASPRS classification colours (ground, low/med/high vegetation, building, water)
const CLS_COL={0:[0.6,0.6,0.6],1:[0.7,0.7,0.7],2:[0.65,0.45,0.25],3:[0.55,0.75,0.35],
4:[0.35,0.65,0.25],5:[0.15,0.5,0.15],6:[0.8,0.45,0.4],7:[0.9,0.3,0.3],9:[0.25,0.5,0.85]};
const clsCol=c=>CLS_COL[c]||[0.5,0.5,0.5];
import {SP} from "./speciesModels.js";
import {ProcessingProgress, useProcessingTask} from "./ProcessingProgress.jsx";
import {calculateTreeVolume,summarizeVolumes,volumeCSV,DEFAULT_VOLUME_OPTIONS} from './volumeAnalysis.js';
import {treeMetricsCSV,areaMetricsCSV} from './metricsExport.js';
import {VolumePanel,VolumeSummary} from './VolumePanel.jsx';
const CL=["#e6194b","#3cb44b","#ffe119","#4363d8","#f58231","#911eb4","#42d4f4","#f032e6","#bfef45","#fabed4","#469990","#dcbeff","#9A6324","#800000","#aaffc3","#808000"];
function hC(t){return[t<.5?0:(t-.5)*2,t<.5?t*2:(1-t)*2,t<.5?(.5-t)*2:0];}
function nS(r){if(r<=0)return 1;const raw=r/6,mg=10**Math.floor(Math.log10(raw)),n=raw/mg;return(n<1.5?1:n<3.5?2:n<7.5?5:10)*mg;}
function dlF(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);}

// --- project identity ---
const FORELAS_NAME="foreLas";
const FORELAS_VERSION="2.1.0";
const FORELAS_OWNER="贵州嘉绿科技咨询有限公司";
const FORELAS_BIBTEX=`@software{forelas_2026,
  author    = {{${FORELAS_OWNER}}},
  title     = {{${FORELAS_NAME}}: 激光点云林木分析系统},
  year      = {2026},
  version   = {${FORELAS_VERSION}},
  publisher = {{${FORELAS_OWNER}}}
}`;

function HeroPhoto(){return <img className="forest-background" src={import.meta.env.BASE_URL+"forest-lidar-4k.jpg"} alt="彩色单木分割森林点云，展示林冠与树木结构" fetchPriority="high"/>;}
const WORKSPACE_MODULES=[["tools","◈","数据与显示","点云属性与地面模型"],["clip","⌖","样地裁剪","圈定研究范围"],["seg","⌘","单木分割","冠层识别与窗口设置"],["metrics","▤","单木指标","树高、冠幅与实测值"],["species","♧","树种模型","胸径与生物量估算"],["volume","▥","蓄积评估","单木材积与林分蓄积评估"],["area","▦","林分统计","高度分布与蓄积量汇总"],["stats","⌁","精度评估","自动与实测结果对比"],["transect","⤴","垂直剖面","样线与冠层结构"]];

export default function App(){
const[data,setData]=useState(null);const[zN,setZN]=useState(null);const[bnd,setBnd]=useState(null);const[msg,setMsg]=useState("");
const[fileName,setFileName]=useState("");
const[cc,setCC]=useState(null);const[cr,setCR]=useState(15);const[cs,setCS]=useState("circle");
const[clp,setClp]=useState(null);const[clpZ,setClpZ]=useState(null);const[clpB,setClpB]=useState(null);
const[segs,setSegs]=useState(null);const[met,setMet]=useState(null);const[areaMet,setAreaMet]=useState(null);const[areaErr,setAreaErr]=useState("");
const[volumeConfig,setVolumeConfig]=useState(null);const[clipRoi,setClipRoi]=useState(null);
const[volumeDraft,setVolumeDraft]=useState(DEFAULT_VOLUME_OPTIONS);
const[sel,setSel]=useState(null);const[sp,setSp]=useState("ps");const[cMode,setCMode]=useState("height");const[view,setView]=useState("2d");
const[ptSz,setPtSz]=useState(1.5);const[ptPct,setPtPct]=useState(100);const[sCell,setSCell]=useState(0.5);const[sMinH,setSMinH]=useState(2);const[sSR,setSSR]=useState(3);
const[loadMode,setLoadMode]=useState("auto");const[loadPct,setLoadPct]=useState(100);
const {task,runTask,isProcessing:isLoading}=useProcessingTask();
const runProcess=useCallback((...args)=>runTask(...args).catch(err=>setMsg("⚠ "+err.message)),[runTask]);
const sourceFileR=useRef(null),appliedSamplingR=useRef(null);
const validLoadPct=Number.isInteger(loadPct)&&loadPct>=1&&loadPct<=100;
const[vwsMode,setVwsMode]=useState(false);const[vwsPreset,setVwsPreset]=useState("pine");const[crownMode,setCrownMode]=useState("bbox");const[dtmSrc,setDtmSrc]=useState("auto");const[extDTM,setExtDTM]=useState(null);
const[vwsCustom,setVwsCustom]=useState({mode:"linear",a:2.5,b:0.05,c:0,min:2,max:5});
const[tab,setTab]=useState("tools");const[theme,setTheme]=useState("dark");const[pan,setPan]=useState({x:0,y:0});const[zoom,setZoom]=useState(1);
const[tMode,setTMode]=useState(false);const[tP1,setTP1]=useState(null);const[tP2,setTP2]=useState(null);const[tData,setTData]=useState(null);
const[showLaz,setShowLaz]=useState(true);const[showCite,setShowCite]=useState(false);const[citeCopied,setCiteCopied]=useState(false);
const topR=useRef(null),sideR=useRef(null),transR=useRef(null),threeR=useRef(null),cleanR=useRef(null);
const inspectorContentR=useRef(null);
useEffect(()=>{inspectorContentR.current?.scrollTo({top:0});},[tab]);
const dragR=useRef({on:false,moved:false,sx:0,sy:0,px:0,py:0});
const dR=useRef(),zR=useRef(),cR=useRef(),czR=useRef(),mR=useRef();
dR.current=data;zR.current=zN;cR.current=clp;czR.current=clpZ;mR.current=met;
const cam3D=useRef({theta:Math.PI/4,phi:Math.PI/3.2,dist:0});
const aP=clp||data,aZ=clpZ||zN,aB=clp?clpB:bnd;
const volumeSummary=useMemo(()=>summarizeVolumes(met,aB,clipRoi,volumeConfig?.areaOverride??''),[met,aB,clipRoi,volumeConfig]);
const dk=theme==="dark"?"#041510":"#f0f6f2",pn2=theme==="dark"?"#0b241c":"#ffffff",bd=theme==="dark"?"#28523e":"#cfdfd4";
const ac=theme==="dark"?"#9cf5bc":"#187548",gn2=theme==="dark"?"#86efac":"#237c4e",og=theme==="dark"?"#f5c578":"#97601d",tx=theme==="dark"?"#ecfff3":"#183526",txD=theme==="dark"?"#88aa98":"#647e6f",txM=theme==="dark"?"#b0cbbd":"#4c6b59";
const BT=on=>({padding:"8px 12px",background:on?ac+"1a":pn2,color:on?ac:txM,border:`1px solid ${on?ac+"66":bd}`,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:on?650:500});
const IN={padding:"7px 9px",background:dk,color:tx,border:`1px solid ${bd}`,borderRadius:6,fontSize:13,fontFamily:"inherit",width:76};
const normRange=aZ?(()=>{let mx=0;const st=Math.max(1,Math.floor(aZ.length/2000));for(let i=0;i<aZ.length;i+=st)if(aZ[i]>mx&&isFinite(aZ[i]))mx=aZ[i];return`0→${mx.toFixed(1)}m`;})():"–";
const hasTrans=tData&&tData.length>0;

const handleFile=useCallback((e,samplePercent=appliedSamplingR.current)=>{const f=e.target.files[0];if(!f)return;
  if(f.name.toLowerCase().endsWith(".laz")){setMsg("⚠ 暂不支持 LAZ 格式");setShowLaz(true);return;}
  return runProcess("点云导入与预处理","load",{file:f,samplePercent,dtmSrc,extDTM},({pts,bounds,normalized,notice,useAuto})=>{
    sourceFileR.current=f;appliedSamplingR.current=samplePercent;
    setData(pts);setFileName(f.name);setBnd(bounds);setZN(normalized);if(useAuto)setDtmSrc("auto");
    setCC(null);setClp(null);setClipRoi(null);setClpZ(null);setClpB(null);setSegs(null);setMet(null);setVolumeConfig(null);setVolumeDraft(DEFAULT_VOLUME_OPTIONS);setAreaMet(null);setAreaErr("");setSel(null);setView("2d");setCMode("height");setPan({x:0,y:0});setZoom(1);setTMode(false);setTP1(null);setTP2(null);setTData(null);cam3D.current={theta:Math.PI/4,phi:Math.PI/3.2,dist:0};
    setMsg(notice);setTab("tools");
  });},[dtmSrc,extDTM,runProcess]);
const handleDTM=useCallback(e=>{const f=e.target.files[0];if(!f)return;
  return runProcess("加载地面模型","dtm",{file:f},dtm=>{setExtDTM(dtm);setDtmSrc("external");setMsg(`✓ DTM 已加载（${dtm.w}×${dtm.h} 格网）`);});},[runProcess]);
const hClip=useCallback(()=>{if(!data||!cc||!zN)return;
  return runProcess("样地点云裁剪","clip",{x:cc.x,y:cc.y,radius:cr,shape:cs},({pts,zN,bounds})=>{setClp(pts);setClipRoi({shape:cs,r:cr});setClpZ(zN);setClpB(bounds);setSegs(null);setMet(null);setVolumeConfig(null);setVolumeDraft(DEFAULT_VOLUME_OPTIONS);setAreaMet(null);setAreaErr("");setPan({x:0,y:0});setZoom(1);setMsg("");});},[data,zN,cc,cr,cs,runProcess]);
const hSeg=useCallback(()=>{if(!dR.current||!zR.current)return;
  return runProcess("单木分割与指标提取","segment",{useClip:!!clp,cell:sCell,minHeight:sMinH,radius:sSR,vwsMode,vwsPreset,vwsCustom,crownMode},({segments,metrics})=>{setSegs(segments);setVolumeConfig(null);setVolumeDraft(DEFAULT_VOLUME_OPTIONS);setAreaMet(null);setAreaErr("");setCMode("segment");setMet(metrics);setMsg("");setTab("metrics");});},[clp,sCell,sMinH,sSR,vwsMode,vwsPreset,vwsCustom,crownMode,runProcess]);
const hArea=useCallback(()=>{if(!dR.current||!zR.current)return;
  return runProcess("林分统计计算","area",{useClip:!!clp,metrics:mR.current,roi:clipRoi},r=>{if(typeof r==="string"){setAreaErr(r);setAreaMet(null);}else{setAreaMet(r);setAreaErr("");}setMsg("");});},[clp,clipRoi,runProcess]);
const hSp=useCallback(()=>{if(!met)return;
  return runProcess("应用树种模型","species",{metrics:met,sp,volumeOptions:volumeConfig},({metrics,notice})=>{setMet(metrics);setMsg(notice);});},[met,sp,volumeConfig,runProcess]);
const hSpAndAssess=useCallback(async()=>{const result=await hSp();if(result?.metrics)setTab("volume");},[hSp]);
const hVolume=useCallback(options=>runProcess("蓄积评估计算","volume",{metrics:mR.current,options},({metrics})=>{setMet(metrics);setVolumeConfig(options);setMsg("");}),[runProcess]);
const hCSV=useCallback(()=>{if(!met)return;return runProcess("导出单木指标",async report=>{report(25,"整理单木指标、材积与林分统计");dlF(new Blob(["\uFEFF"+treeMetricsCSV(met,areaMet,volumeSummary,volumeConfig)],{type:"text/csv;charset=utf-8"}),"foreLas_tree_metrics.csv");});},[met,areaMet,volumeSummary,volumeConfig,runProcess]);
const hAreaCSV=useCallback(()=>{if(!areaMet)return;return runProcess("导出林分统计",async report=>{report(25,"整理林分与蓄积量统计");dlF(new Blob(["\uFEFF"+areaMetricsCSV(areaMet,volumeSummary,volumeConfig)],{type:"text/csv;charset=utf-8"}),"foreLas_area_metrics.csv");});},[areaMet,volumeSummary,volumeConfig,runProcess]);
const hVolumeCSV=useCallback(()=>{if(!met||!volumeConfig)return;return runProcess("导出蓄积评估",async report=>{report(25,"整理单木材积与统计");dlF(new Blob(["\uFEFF"+volumeCSV(met,volumeSummary,volumeConfig)],{type:"text/csv;charset=utf-8"}),"foreLas_volume.csv");});},[met,volumeSummary,volumeConfig,runProcess]);
const hImg=useCallback(()=>runProcess("导出当前视图",async report=>{report(25,"生成视图图像");if(view==="3d"){const el=threeR.current;if(!el)return;const wc=el.querySelector("canvas");if(!wc)return;try{const url=wc.toDataURL("image/png");const a=document.createElement("a");a.href=url;a.download="foreLas_3d.png";document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(err){throw new Error("图像导出失败："+err.message);}
}else{const cv=topR.current;if(!cv)return;const W=cv.width,H=cv.height;const tmp=document.createElement("canvas");tmp.width=W;tmp.height=H;const ctx=tmp.getContext("2d");ctx.drawImage(cv,0,0);
const m=mR.current;if(m&&m.length>0&&cv._tr){const{oX,oY,sc,xMn,yMn}=cv._tr;const isDk=theme==="dark";ctx.font="bold 18px monospace";ctx.textAlign="center";ctx.textBaseline="middle";
m.forEach(t=>{const rx=t.cxRel!==undefined?t.cxRel:t.cx,ry=t.cyRel!==undefined?t.cyRel:t.cy;const px=oX+(rx-xMn)*sc,py=oY-(ry-yMn)*sc;if(px<0||px>W||py<0||py>H)return;ctx.fillStyle=isDk?"#000000cc":"#ffffffcc";ctx.beginPath();ctx.arc(px,py,12,0,Math.PI*2);ctx.fill();ctx.fillStyle=isDk?"#ffffff":"#000000";ctx.fillText(t.id,px,py);});}
ctx.font="bold 20px monospace";ctx.fillStyle=ac;ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(`${FORELAS_NAME} ${FORELAS_VERSION} · 激光点云林木分析系统`,10,10);await new Promise((resolve,reject)=>tmp.toBlob(blob=>{if(blob){dlF(blob,"foreLas_map.png");resolve();}else reject(new Error("图像导出失败"));},"image/png"));}}),[view,theme,runProcess]);
const uMet=useCallback((id,f,v)=>{setMet(prev=>prev.map(m=>{if(m.id!==id)return m;const updated={...m,[f]:v};return volumeConfig&&(f==="dbhManual"||f==="hManual")?calculateTreeVolume(updated,volumeConfig):updated;}));},[volumeConfig]);
const hReset=()=>{setClp(null);setClipRoi(null);setClpZ(null);setClpB(null);setSegs(null);setMet(null);setVolumeConfig(null);setVolumeDraft(DEFAULT_VOLUME_OPTIONS);setAreaMet(null);setAreaErr("");setCC(null);setSel(null);setCMode("height");setPan({x:0,y:0});setZoom(1);setTP1(null);setTP2(null);setTData(null);};
const cSt=useCallback(pairs=>{if(!pairs||pairs.length<3)return null;const n=pairs.length,df=n-1,diffs=pairs.map(p=>p.a-p.b),mD=diffs.reduce((s,v)=>s+v,0)/n,rmse=Math.sqrt(diffs.reduce((s,v)=>s+v*v,0)/n);const mA=pairs.reduce((s,p)=>s+p.a,0)/n,mB=pairs.reduce((s,p)=>s+p.b,0)/n;let sAB=0,sAA=0,sBB=0;pairs.forEach(p=>{sAB+=(p.a-mA)*(p.b-mB);sAA+=(p.a-mA)**2;sBB+=(p.b-mB)**2;});const r2=sAA>0&&sBB>0?(sAB/(Math.sqrt(sAA)*Math.sqrt(sBB)))**2:0;const se=Math.sqrt(diffs.reduce((s,v)=>s+(v-mD)**2,0)/(n*(n-1)));const ts=se>0?mD/se:0;const ax=Math.abs(ts),tt=1/(1+.2316419*ax),nd=.3989422804*Math.exp(-ax*ax/2),pt=nd*tt*(.3193815+tt*(-.3565638+tt*(1.781478+tt*(-1.821256+tt*1.330274)))),cf=df<30?1+1/(4*df)+(1+2*ax*ax)/(16*df*df):1,pv=Math.min(1,2*pt*cf);return{n,rmse:rmse.toFixed(2),bias:mD.toFixed(2),r2:r2.toFixed(3),t:ts.toFixed(2),p:pv<.001?"<0.001":pv.toFixed(3)};},[]); 

// --- draw 2D (topR size stays fixed) ---
const draw2D=useCallback(()=>{if(!aP||!aB)return;
const drawC=(cv,isTop)=>{if(!cv||!cv.offsetWidth)return;const ctx=cv.getContext("2d");const W=cv.width=cv.offsetWidth*2,H=cv.height=cv.offsetHeight*2;ctx.fillStyle=dk;ctx.fillRect(0,0,W,H);
const xA=aP.x,yA=isTop?aP.y:aP.z,xMn=aB.x0,xMx=aB.x1,yMn=isTop?aB.y0:aB.z0,yMx=isTop?aB.y1:aB.z1,rX=xMx-xMn||1,rY=yMx-yMn||1,bsc=Math.min((W-50)/rX,(H-50)/rY),sc=bsc*zoom;
const oX=W/2-((xMn+xMx)/2-xMn)*sc+(isTop?pan.x*2:0),oY=H/2+((yMn+yMx)/2-yMn)*sc-(isTop?pan.y*2:0);
ctx.strokeStyle=theme==="dark"?"#123024":"#dce8df";ctx.lineWidth=1;const gs=nS(rX/zoom);ctx.font="16px monospace";ctx.fillStyle=txD;
for(let v=Math.floor(xMn/gs)*gs;v<=xMx;v+=gs){const px=oX+(v-xMn)*sc;if(px>0&&px<W){ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,H);ctx.stroke();ctx.fillText(v.toFixed(0),px+2,H-4);}}
for(let v=Math.floor(yMn/gs)*gs;v<=yMx;v+=gs){const py=oY-(v-yMn)*sc;if(py>0&&py<H){ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(W,py);ctx.stroke();ctx.fillText(v.toFixed(0),4,py-4);}}
const sbM=nS(rX/zoom),sbPx=sbM*sc;ctx.fillStyle=ac;ctx.fillRect(W-sbPx-20,H-16,sbPx,3);ctx.fillText(`${sbM} m`,W-sbPx-18,H-20);
if(!isTop){[1.3,5,10,15,20,25,30].forEach(hv=>{if(hv>rY)return;const py=oY-hv*sc;if(py<0||py>H)return;ctx.strokeStyle=hv===1.3?"#f5920066":"#22d3ee22";ctx.lineWidth=hv===1.3?2:1;ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(W,py);ctx.stroke();ctx.fillStyle=hv===1.3?"#f59200":"#22d3ee66";ctx.font="14px monospace";ctx.fillText(`${hv}m`,W-40,py-3);});}
const mx=Math.floor(5e5*(ptPct/100)),st=aP.x.length>mx?Math.ceil(aP.x.length/mx):1;
for(let i=0;i<aP.x.length;i+=st){const px=oX+(xA[i]-xMn)*sc,py=oY-(yA[i]-yMn)*sc;if(px<-5||px>W+5||py<-5||py>H+5)continue;
if(sel!==null&&segs&&segs.labels[i]!==sel&&segs.labels[i]>0){ctx.fillStyle=theme==="dark"?"#151a22":"#e8e8e8";ctx.fillRect(px,py,ptSz*.7,ptSz*.7);continue;}
if(cMode==="rgb"&&aP.hasRGB)ctx.fillStyle=`rgb(${aP.r[i]},${aP.g[i]},${aP.b[i]})`;
else if(cMode==="segment"&&segs){const l=segs.labels[i];ctx.fillStyle=l<=0?(theme==="dark"?"#151a22":"#ddd"):CL[(l-1)%CL.length];}
else if(cMode==="normalized"&&aZ){const t=Math.min(1,aZ[i]/30);const[cr2,cg,cb]=hC(t);ctx.fillStyle=`rgb(${cr2*255|0},${cg*255|0},${cb*255|0})`;}
else if(cMode==="intensity"){const v=Math.min(255,aP.intensity[i]);ctx.fillStyle=`rgb(${v},${v},${v})`;}
else if(cMode==="classification"){const[cr2,cg,cb]=clsCol(aP.classification[i]);ctx.fillStyle=`rgb(${cr2*255|0},${cg*255|0},${cb*255|0})`;}
else{const t=aB.z1===aB.z0?.5:(aP.z[i]-aB.z0)/(aB.z1-aB.z0);const[cr2,cg,cb]=hC(t);ctx.fillStyle=`rgb(${cr2*255|0},${cg*255|0},${cb*255|0})`;}
ctx.fillRect(px,py,ptSz,ptSz);}
if(!clp&&cc&&isTop){const cx2=oX+(cc.x-xMn)*sc,cy2=oY-(cc.y-yMn)*sc,r2=cr*sc;ctx.shadowColor="#00ffff";ctx.shadowBlur=12;ctx.strokeStyle="#00ffff";ctx.lineWidth=3;ctx.setLineDash([8,4]);ctx.beginPath();if(cs==="circle")ctx.arc(cx2,cy2,r2,0,Math.PI*2);else ctx.rect(cx2-r2,cy2-r2,r2*2,r2*2);ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;ctx.fillStyle="#00ffff";ctx.beginPath();ctx.arc(cx2,cy2,6,0,Math.PI*2);ctx.fill();ctx.font="bold 16px monospace";ctx.fillText(`r=${cr}m`,cx2+10,cy2-10);}
if(tP1&&isTop){const ax=oX+(tP1.x-xMn)*sc,ay=oY-(tP1.y-yMn)*sc;ctx.fillStyle="#ff6384";ctx.beginPath();ctx.arc(ax,ay,6,0,Math.PI*2);ctx.fill();
if(tP2){const bx=oX+(tP2.x-xMn)*sc,by=oY-(tP2.y-yMn)*sc;ctx.strokeStyle="#ff6384";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.fillStyle="#ff6384";ctx.beginPath();ctx.arc(bx,by,6,0,Math.PI*2);ctx.fill();const d=Math.sqrt((tP2.x-tP1.x)**2+(tP2.y-tP1.y)**2);ctx.font="bold 14px monospace";ctx.fillText(`${d.toFixed(1)}m`,(ax+bx)/2+8,(ay+by)/2-8);}}
cv._tr={oX,oY,sc,xMn,yMn,W,H};};
drawC(topR.current,true);drawC(sideR.current,false);
// TRANSECT — ayrı sabit canvas, topR'den bağımsız
const tc=transR.current;if(tc&&tData&&tData.length>0&&tc.offsetWidth>0){
const ctx=tc.getContext("2d"),W=tc.width=tc.offsetWidth*2,H=tc.height=tc.offsetHeight*2;ctx.fillStyle=dk;ctx.fillRect(0,0,W,H);
let mD2=0,mZ=0;for(const p of tData){if(p.dist>mD2)mD2=p.dist;if(p.zN>mZ)mZ=p.zN;}const pL=50,pRt=20,pT=20,pBt=25;
const sx=(W-pL-pRt)/Math.max(mD2,1),sz=(H-pT-pBt)/Math.max(mZ,1);
ctx.strokeStyle="#8B4513";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pL,H-pBt);ctx.lineTo(W-pRt,H-pBt);ctx.stroke();
for(let h=0;h<=mZ;h+=2){const y=H-pBt-h*sz;if(y<pT)continue;ctx.strokeStyle="#22d3ee15";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(W-pRt,y);ctx.stroke();ctx.fillStyle=txD;ctx.font="13px monospace";ctx.fillText(`${h}m`,5,y+4);}
const binSz=0.5,bins=new Map();for(const p of tData){const k=Math.floor(p.dist/binSz);if(!bins.has(k)||p.zN>bins.get(k).zN)bins.set(k,p);}
const sorted=[...bins.values()].sort((a,b2)=>a.dist-b2.dist);
ctx.beginPath();ctx.moveTo(pL,H-pBt);for(const p of sorted)ctx.lineTo(pL+p.dist*sx,H-pBt-p.zN*sz);ctx.lineTo(pL+mD2*sx,H-pBt);ctx.closePath();ctx.fillStyle="#22d3ee15";ctx.fill();
ctx.beginPath();for(let i=0;i<sorted.length;i++){const x=pL+sorted[i].dist*sx,y=H-pBt-sorted[i].zN*sz;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.strokeStyle="#22d3ee";ctx.lineWidth=1.5;ctx.stroke();
for(const p of tData){const px=pL+p.dist*sx,py=H-pBt-p.zN*sz,t=mZ>0?p.zN/mZ:0;const[r,g,b2]=hC(t);ctx.fillStyle=`rgb(${r*255|0},${g*255|0},${b2*255|0})`;ctx.fillRect(px-1,py-1,2,2);}
if(mZ>1.3){const y=H-pBt-1.3*sz;ctx.strokeStyle="#f5920055";ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(W-pRt,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#f59200";ctx.font="12px monospace";ctx.fillText("1.3m",W-pRt+2,y+4);}
ctx.fillStyle=ac;ctx.font="bold 14px monospace";ctx.fillText(`Transect: ${mD2.toFixed(1)}m | Hmax: ${mZ.toFixed(1)}m | ${tData.length}pts`,pL,14);}
},[aP,aB,aZ,cc,cr,cs,cMode,segs,ptSz,ptPct,clp,sel,pan,zoom,theme,dk,txD,tP1,tP2,tData]);
useEffect(()=>{if(view!=="2d"||!aP)return;draw2D();let frame;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw2D);});[topR.current,sideR.current,transR.current].filter(Boolean).forEach(el=>observer.observe(el));return()=>{observer.disconnect();cancelAnimationFrame(frame);};},[draw2D,view,aP]);
// Transect canvas, açılma animasyonu (height 0→160) bittikten sonra 0-yükseklikli
// canvas'a çizildiği için ilk anda boş kalıyordu. Konteyner gerçek yüksekliğe
// ulaşana kadar rAF ile bekleyip yeniden çiziyoruz (sekme değiştirme gerekmez).
useEffect(()=>{if(view!=="2d"||!hasTrans)return;let raf,tries=0;
const tick=()=>{const tc=transR.current;if(tc&&tc.offsetHeight>0){draw2D();return;}if(tries++<30)raf=requestAnimationFrame(tick);};
raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[hasTrans,tData,view,draw2D]);

// --- 3D ---
useEffect(()=>{if(view!=="3d"||!aP||!aB)return;const el=threeR.current;if(!el)return;if(cleanR.current){cleanR.current();cleanR.current=null;}
const W=el.offsetWidth,H=el.offsetHeight;if(!W||!H)return;const scene=new THREE.Scene();scene.background=new THREE.Color(theme==="dark"?0x041510:0xf0f6f2);
const cam=new THREE.PerspectiveCamera(55,W/H,.1,1e4);const ren=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});ren.setSize(W,H);el.appendChild(ren.domElement);
const cx=(aB.x0+aB.x1)/2,cy=(aB.y0+aB.y1)/2,cz=(aB.z0+aB.z1)/2,range=Math.max(aB.x1-aB.x0,aB.y1-aB.y0,aB.z1-aB.z0)||10;
if(cam3D.current.dist===0)cam3D.current.dist=range*1.1;let{theta,phi,dist}=cam3D.current;
const mP=Math.floor(8e5*(ptPct/100)),st=aP.x.length>mP?Math.ceil(aP.x.length/mP):1,cnt=Math.ceil(aP.x.length/st);
const pos=new Float32Array(cnt*3),col=new Float32Array(cnt*3);let j=0;const selV=sel;
for(let i=0;i<aP.x.length&&j<cnt;i+=st){pos[j*3]=aP.x[i]-cx;pos[j*3+1]=aP.z[i]-cz;pos[j*3+2]=-(aP.y[i]-cy);
const isSel=selV===null||!segs||segs.labels[i]===selV||segs.labels[i]<=0;
if(!isSel){col[j*3]=.05;col[j*3+1]=.05;col[j*3+2]=.07;j++;continue;}
if(cMode==="rgb"&&aP.hasRGB){col[j*3]=aP.r[i]/255;col[j*3+1]=aP.g[i]/255;col[j*3+2]=aP.b[i]/255;}
else if(cMode==="segment"&&segs){const l=segs.labels[i];if(l<=0){col[j*3]=.06;col[j*3+1]=.07;col[j*3+2]=.09;}else{const h=CL[(l-1)%CL.length];col[j*3]=parseInt(h.slice(1,3),16)/255;col[j*3+1]=parseInt(h.slice(3,5),16)/255;col[j*3+2]=parseInt(h.slice(5,7),16)/255;}}
else if(cMode==="normalized"&&aZ){const t=Math.min(1,aZ[i]/30);const[r,g,b2]=hC(t);col[j*3]=r;col[j*3+1]=g;col[j*3+2]=b2;}
else if(cMode==="intensity"){const v=Math.min(1,aP.intensity[i]/255);col[j*3]=v;col[j*3+1]=v;col[j*3+2]=v;}
else if(cMode==="classification"){const[r2,g2,b3]=clsCol(aP.classification[i]);col[j*3]=r2;col[j*3+1]=g2;col[j*3+2]=b3;}
else{const t=aB.z1===aB.z0?.5:(aP.z[i]-aB.z0)/(aB.z1-aB.z0);const[r,g,b2]=hC(t);col[j*3]=r;col[j*3+1]=g;col[j*3+2]=b2;}j++;}
const geom=new THREE.BufferGeometry();geom.setAttribute("position",new THREE.BufferAttribute(pos,3));geom.setAttribute("color",new THREE.BufferAttribute(col,3));
const mat=new THREE.PointsMaterial({size:ptSz*.8,vertexColors:true,sizeAttenuation:true});scene.add(new THREE.Points(geom,mat));
const gs=Math.ceil(range/10)*10;const grid=new THREE.GridHelper(gs,Math.ceil(gs/5),theme==="dark"?0x1a3528:0xa8c8a8,theme==="dark"?0x112218:0xc8dcc8);grid.position.y=-(aB.z1-aB.z0)/2;scene.add(grid);
const upC=()=>{cam.position.set(dist*Math.sin(phi)*Math.cos(theta),dist*Math.cos(phi),dist*Math.sin(phi)*Math.sin(theta));cam.lookAt(0,0,0);cam3D.current={theta,phi,dist};};upC();
let drag=false,px_=0,py_=0;const dE=ren.domElement;
const oD=e=>{drag=true;px_=e.clientX;py_=e.clientY;};const oM=e=>{if(!drag)return;theta+=(e.clientX-px_)*.005;phi=Math.max(.1,Math.min(Math.PI-.1,phi-(e.clientY-py_)*.005));px_=e.clientX;py_=e.clientY;upC();};
const oU=()=>{drag=false;};const oW=e=>{dist*=e.deltaY>0?1.08:.92;dist=Math.max(range*.05,Math.min(range*6,dist));upC();e.preventDefault();};
dE.addEventListener("mousedown",oD);dE.addEventListener("mousemove",oM);dE.addEventListener("mouseup",oU);dE.addEventListener("mouseleave",oU);dE.addEventListener("wheel",oW,{passive:false});
const resizeObserver=new ResizeObserver(()=>{const w=el.offsetWidth,h=el.offsetHeight;if(!w||!h)return;cam.aspect=w/h;cam.updateProjectionMatrix();ren.setSize(w,h);});resizeObserver.observe(el);
let aId;const an=()=>{aId=requestAnimationFrame(an);ren.render(scene,cam);};an();
cleanR.current=()=>{cam3D.current={theta,phi,dist};resizeObserver.disconnect();cancelAnimationFrame(aId);dE.removeEventListener("mousedown",oD);dE.removeEventListener("mousemove",oM);dE.removeEventListener("mouseup",oU);dE.removeEventListener("mouseleave",oU);dE.removeEventListener("wheel",oW);geom.dispose();mat.dispose();ren.dispose();try{ren.forceContextLoss();}catch(_){}if(el.contains(dE))el.removeChild(dE);};
return()=>{if(cleanR.current){cleanR.current();cleanR.current=null;}};},[view,aP,aB,aZ,cMode,segs,sel,ptSz,ptPct,theme]);

// --- mouse ---
const handleMouse=useCallback((e,act)=>{const c=topR.current;if(!c||!c._tr)return;const rect=c.getBoundingClientRect();
const px=(e.clientX-rect.left)*2,py=(e.clientY-rect.top)*2;const{oX,oY,sc,xMn,yMn}=c._tr;const wx=(px-oX)/sc+xMn,wy=(oY-py)/sc+yMn;
if(act==="down")dragR.current={on:true,moved:false,sx:e.clientX,sy:e.clientY,px:pan.x,py:pan.y};
else if(act==="move"){if(!dragR.current.on)return;if(Math.abs(e.clientX-dragR.current.sx)>4||Math.abs(e.clientY-dragR.current.sy)>4)dragR.current.moved=true;
if(dragR.current.moved)setPan({x:dragR.current.px+(e.clientX-dragR.current.sx),y:dragR.current.py+(e.clientY-dragR.current.sy)});}
else if(act==="up"){const wd=dragR.current.moved;dragR.current.on=false;dragR.current.moved=false;
if(!wd){if(tMode){if(!tP1)setTP1({x:wx,y:wy});else{setTP2({x:wx,y:wy});if(dR.current&&zR.current)runProcess("垂直剖面提取","transect",{useClip:!!clp,p1:tP1,p2:{x:wx,y:wy}},setTData);setTMode(false);}}
else if(!clp&&zN)setCC({x:wx,y:wy});}}
else if(act==="wheel"){e.preventDefault();setZoom(z=>Math.max(.1,Math.min(50,z*(e.deltaY>0?.9:1.1))));}
},[clp,zN,tMode,tP1,pan,runProcess]);

// --- render ---
const hDrop=e=>{e.preventDefault();const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)handleFile({target:{files:[f]}});};
if(!data)return(
<><ProcessingProgress task={task}/><main inert={isLoading} aria-busy={isLoading} className="landing template-landing" style={{"--forest-image":`url("${import.meta.env.BASE_URL}forest-lidar-4k.jpg")`}} onDragOver={e=>e.preventDefault()} onDrop={hDrop}>
 <header className="landing-nav dashboard-topbar"><a className="brand" href="#home"><span className="brand-mark">F</span><span>{FORELAS_NAME}<small>激光点云林木分析系统</small></span></a><div className="nav-links"><button onClick={()=>setShowCite(s=>!s)}>⚙ 设置 / 引用</button><span className="user-chip"><i/> 本地分析工作区</span></div></header>
 <div className="dashboard-layout">
  <div className="dashboard-main">
   <section className="dashboard-hero" id="home"><div className="dashboard-hero-art"><HeroPhoto/></div><div className="dashboard-hero-copy"><div className="eyebrow"><span/> UAV · LiDAR · FOREST INTELLIGENCE</div><h1>让每一片森林<br/><em>都清晰可读。</em></h1><p className="hero-lede">基于激光雷达点云数据的单木分割与林木参数提取平台，提供从数据导入、预处理、单木分割到参数计算与可视化的一站式分析体验。</p><div className="hero-actions"><label className="primary-cta"><span>▰　导入点云数据</span><b>→</b><input type="file" accept=".las,.laz" onChange={handleFile}/></label><a className="hero-secondary" href="#capabilities">查看分析能力 ↗</a></div>{msg&&<div className="landing-message" role="status">{msg}</div>}<div className="hero-trust"><span>支持 LAS 1.2–1.4</span><span>本地文件读取</span><span>单木分割与参数提取</span></div></div></section>
   <section className="workflow-panel" id="workflow"><div className="panel-title"><div><small>FROM POINT CLOUD TO INSIGHT</small><h2>分析流程</h2></div><span>从原始点云到林分指标</span></div><div className="workflow-steps">{[["1","导入点云数据","LAS 文件解析"],["2","点云预处理","高度归一化与裁剪"],["3","单木分割","CHM 与可变窗口"],["4","参数提取","树高、冠幅、DBH"],["5","结果导出","指标表与统计"]].map(([n,t,d],i)=><div className="workflow-step" key={n}><i>{n}</i><span><b>{t}</b><small>{d}</small></span>{i<4&&<em>›</em>}</div>)}</div></section>
   <div className="dashboard-lower"><section className="capabilities" id="capabilities"><div className="panel-title"><div><small>ANALYSIS MODULES</small><h2>平台分析能力</h2></div><span>研究级森林结构分析</span></div><div className="cap-grid">{[["01","◌","点云解析","LAS 分类、强度与 RGB 属性","point-cloud","按高度着色的森林激光点云与地面网格"],["02","⌘","单木分割","冠层模型与可变窗口区域生长","tree-segmentation","以不同颜色标识单株树冠边界和树顶的分割示意"],["03","⌖","林分统计","高度分位数、密度与冠层覆盖","stand-statistics","林分树高剖面、高度分位线与分布统计图"],["04","⌁","生态估算","树种模型、DBH 与生物量","ecological-estimation","树高、胸径测量与树木各组分生物量估算示意"]].map(([n,icon,title,desc,art,alt])=><article className="cap-card" key={n}><img className="cap-thumbnail" src={`${import.meta.env.BASE_URL}capabilities/${art}.svg`} alt={alt} width="640" height="300" loading="lazy" decoding="async"/><div className="cap-info"><div className="cap-top"><span>{n}</span><b>{icon}</b></div><h3>{title}</h3><p>{desc}</p></div></article>)}</div></section>
    <aside className="quick-panel" id="research"><div className="panel-title"><div><small>QUICK START</small><h2>快速开始</h2></div></div><div className="quick-intro">先选择地面归一化模型，再导入 LAS 点云。</div><div className="ground-choices"><label className={dtmSrc==="auto"?"ground-choice chosen":"ground-choice"}><input type="radio" name="dtmSrcL" checked={dtmSrc==="auto"} onChange={()=>setDtmSrc("auto")}/><span><b>自动地面模型</b><small>网格最低点估计</small></span></label><label className={dtmSrc==="external"?"ground-choice chosen":"ground-choice"}><input type="radio" name="dtmSrcL" checked={dtmSrc==="external"} onChange={()=>setDtmSrc("external")}/><span><b>外部 DTM</b><small>GeoTIFF / ASCII / XYZ</small></span></label>{dtmSrc==="external"&&<label className="dtm-upload">{extDTM?`已载入 ${extDTM.w} × ${extDTM.h}`:"选择地面模型文件"}<input type="file" accept=".tif,.tiff,.asc,.txt,.xyz,.csv" onChange={handleDTM}/></label>}</div><label className="secondary-cta"><span>＋　选择 LAS 文件</span><input type="file" accept=".las,.laz" onChange={handleFile}/></label><p className="quick-note">数据仅在当前设备中读取和计算。</p></aside></div>
   <footer className="landing-footer"><span>版权所有：{FORELAS_OWNER} · {FORELAS_NAME} {FORELAS_VERSION}</span><span className="footer-local">数据不离开本机</span><div/><button onClick={()=>setShowCite(s=>!s)}>引用</button></footer>{showCite&&<div className="citation-panel"><div className="citation-head"><b>BibTeX</b><button onClick={()=>{navigator.clipboard?.writeText(FORELAS_BIBTEX).then(()=>{setCiteCopied(true);setTimeout(()=>setCiteCopied(false),1500);});}}>{citeCopied?"已复制":"复制"}</button></div><pre>{FORELAS_BIBTEX}</pre></div>}
  </div>
 </div>
</main></>);return(
<><ProcessingProgress task={task} theme={theme}/><div inert={isLoading} aria-busy={isLoading} className={"analysis-workspace workspace-"+theme} style={{"--ws-bg":dk,"--ws-panel":pn2,"--ws-line":bd,"--ws-accent":ac,"--ws-text":tx,"--ws-muted":txD,"--ws-secondary":txM,"--ws-forest":`url("${import.meta.env.BASE_URL}forest-lidar-4k.jpg")`,"--ws-contours":`url("${import.meta.env.BASE_URL}workspace-contours.svg")`}} onDragOver={e=>e.preventDefault()} onDrop={hDrop}>
 <header className="workspace-header">
  <button className="brand workspace-brand" onClick={()=>setData(null)} title="返回首页"><span className="brand-mark">F</span><span>{FORELAS_NAME}<small>激光点云林木分析系统</small></span></button>
  <div className="workspace-breadcrumb">本地工作区 <span>/</span> 森林点云分析</div>
  <div className="workspace-header-actions"><span className="workspace-local"><i/> 本地安全计算</span><button className="workspace-icon-button" aria-label="切换主题" title="切换明暗主题" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>{theme==="dark"?"☀":"☾"}</button><label className="workspace-import">＋ 导入点云<input type="file" accept=".las,.laz" onChange={handleFile}/></label></div>
 </header>
 <div className="workspace-body" inert={isLoading?true:undefined}>
  <nav className="workspace-sidebar" aria-label="分析模块">
   <div className="workspace-nav-heading">分析工作空间 <small>ANALYSIS WORKSPACE</small></div>
   <div className="workspace-nav-items">{WORKSPACE_MODULES.map(([key,icon,title,desc])=><button key={key} title={title} className={"workspace-nav-item"+(tab===key?" active":"")} aria-current={tab===key?"page":undefined} onClick={()=>setTab(key)}><span className="workspace-nav-icon">{icon}</span><span><b>{title}</b><small>{desc}</small></span>{tab===key&&<i/>}</button>)}</div>
   <div className="workspace-dataset"><small>当前数据集</small><strong title={fileName}>{fileName||"LAS 点云"}</strong><span>{data.nOrig.toLocaleString()} 个原始点</span><div><i/> {zN?"高度归一化已完成":"正在准备数据"}</div></div>
  </nav>
  <main className="workspace-main">
   <div className="workspace-page-heading"><div><small>FOREST INTELLIGENCE</small><h1>点云分析工作台</h1><p title={fileName}>{fileName} <span>·</span> {clp?"样地裁剪数据":data.n===data.nOrig?"完整点云数据":"抽样点云数据"}</p></div><button className="workspace-outline" onClick={hImg}>↗ 导出当前视图</button></div>
   <div className="workspace-overview">
    <div><span>当前分析点数</span><strong>{aP.x.length.toLocaleString()}<small>pts</small></strong></div>
    <div><span>研究范围</span><strong>{((aB.x1-aB.x0)*(aB.y1-aB.y0)).toLocaleString(undefined,{maximumFractionDigits:0})}<small>m²</small></strong></div>
    <div><span>归一化高度</span><strong>{normRange}</strong></div>
    <div><span>识别单木</span><strong>{segs?(met?met.length:segs.count).toLocaleString():"—"}<small>{segs?"棵":"等待分割"}</small></strong></div>
   </div>
   {msg&&<div className="workspace-message" role="status">{msg}</div>}
   <section className="workspace-viewer" aria-label="点云可视化">
    <div className="workspace-viewer-toolbar"><div className="workspace-viewer-title"><i/> 点云视图 <small>{view==="2d"?"二维联合视图":"三维交互视图"}</small></div><div className="workspace-viewer-controls"><div className="workspace-view-switch">{["2d","3d"].map(v=><button key={v} className={view===v?"selected":""} aria-pressed={view===v} onClick={()=>{if(v!==view)runProcess(v==="3d"?"生成三维点云视图":"生成二维点云视图",async report=>{report(35,"准备点云可视化");setView(v);});}}>{v.toUpperCase()}</button>)}</div><label className="workspace-color-select"><span>着色</span><select value={cMode} onChange={e=>setCMode(e.target.value)}><option value="height">原始高度</option><option value="normalized">归一化高度</option>{aP.hasRGB&&<option value="rgb">RGB 真彩色</option>}<option value="intensity">回波强度</option><option value="classification">点云分类</option>{segs&&<option value="segment">单木分割</option>}</select></label>{clp&&<button className="workspace-outline" onClick={hReset}>↩ 重置裁剪</button>}</div></div>
    <div className="workspace-canvas-stack">
     <div className={"workspace-canvas-layout "+(view==="2d"?"is-2d":"is-3d")}>
      {view==="2d"?(<><div className="workspace-plan-view"><span className="workspace-view-label">俯视图 <small>XY</small></span><canvas ref={topR} style={{cursor:tMode?"crosshair":"grab"}} onMouseDown={e=>handleMouse(e,"down")} onMouseMove={e=>handleMouse(e,"move")} onMouseUp={e=>handleMouse(e,"up")} onMouseLeave={e=>{dragR.current.on=false;dragR.current.moved=false;}} onWheel={e=>handleMouse(e,"wheel")}/><div className="workspace-canvas-hint">{tMode?"样线模式：点击两个点绘制剖面":!clp&&zN?"点击设置裁剪中心 · 拖动平移 · 滚轮缩放":"拖动平移 · 滚轮缩放"}</div></div><div className="workspace-elevation-view"><span className="workspace-view-label">侧视图 <small>XZ</small></span><canvas ref={sideR}/></div></>):<div ref={threeR} className="workspace-three-view"/>}
     </div>
     {view==="2d"&&<div className="workspace-transect" style={{height:hasTrans?180:0}}><canvas ref={transR} onMouseDown={e=>e.stopPropagation()} onMouseMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}/></div>}
    </div>
    <div className="workspace-viewer-footer"><span><i/> {view==="2d"?"平面与高程同步展示":"拖动旋转 · 滚轮缩放"}</span><span>{cMode==="segment"?"单木分割着色":cMode==="classification"?"ASPRS 分类":cMode==="normalized"?"相对地面高度":cMode==="intensity"?"激光回波强度":cMode==="rgb"?"RGB 真彩色":"原始高程着色"}</span></div>
   </section>
  </main>
  <aside className="workspace-inspector" aria-label="分析参数"><div className="workspace-inspector-heading"><small>PARAMETERS & RESULTS</small><h2>{WORKSPACE_MODULES.find(m=>m[0]===tab)?.[2]}</h2><p>{WORKSPACE_MODULES.find(m=>m[0]===tab)?.[3]}</p></div><div className="workspace-panel-content" ref={inspectorContentR}>

{tab==="tools"&&(<><Sc t="分析抽样比例">
<div className="workspace-sampling-modes">
<label><input type="radio" name="loadMode" checked={loadMode==="auto"} onChange={()=>setLoadMode("auto")}/>自动抽样（默认）</label>
<label><input type="radio" name="loadMode" checked={loadMode==="manual"} onChange={()=>setLoadMode("manual")}/>手动百分比</label>
</div>
<div className="workspace-sampling-controls">
<input aria-label="分析抽样百分比滑块" type="range" min={1} max={100} step={1} value={validLoadPct?loadPct:100} disabled={loadMode!=="manual"} onChange={e=>setLoadPct(Number(e.target.value))}/>
<label><input aria-label="分析抽样百分比" type="number" min={1} max={100} step={1} value={loadPct} disabled={loadMode!=="manual"} onChange={e=>setLoadPct(e.target.value===""?"":Number(e.target.value))} style={{...IN,width:62}}/>%</label>
</div>
<p className="workspace-sampling-note">{loadMode==="auto"?"沿用原规则：超过 500 万点时自动间隔抽样。":"1%–100% 整数；100% 加载全部点，不做分析抽样。"}</p>
<button style={{...BT(true),width:"100%"}} disabled={isLoading||(loadMode==="manual"&&!validLoadPct)} onClick={()=>handleFile({target:{files:[sourceFileR.current]}},loadMode==="auto"?null:loadPct)}>{isLoading?"加载中…":"应用并重新加载"}</button>
<p className="workspace-sampling-note">应用后重新归一化，并清除裁剪、分割及指标结果。</p>
<div className="workspace-sampling-current">当前：{data.samplePercent===null?"自动抽样":`${data.samplePercent}%` } · 已加载 {data.n.toLocaleString()} / {data.nOrig.toLocaleString()} 点</div>
</Sc><Sc t="显示">
<Rw l="大小"><input type="range" min={.5} max={5} step={.25} value={ptSz} onChange={e=>setPtSz(+e.target.value)} style={{flex:1}}/><span style={{fontSize:11,color:txM,width:20}}>{ptSz}</span></Rw>
<Rw l="显示采样"><input aria-label="显示采样比例" type="range" min={10} max={100} step={5} value={ptPct} onChange={e=>setPtPct(+e.target.value)} style={{flex:1}}/><span style={{fontSize:11,color:txM,width:28}}>{ptPct}%</span></Rw><p className="workspace-sampling-note">仅调整画面显示点数，不改变分析数据。</p></Sc>
<Sc t="地面 (DTM)">
<div style={{fontSize:11,color:txM,marginBottom:4,lineHeight:1.4}}>加载新文件时用于归一化</div>
<label style={{fontSize:12,color:tx,display:"flex",alignItems:"center",gap:4,marginBottom:3,cursor:"pointer"}}><input type="radio" name="dtmSrc" checked={dtmSrc==="auto"} onChange={()=>setDtmSrc("auto")} style={{margin:0}}/>自动（网格最低点）</label>
<label style={{fontSize:12,color:tx,display:"flex",alignItems:"center",gap:4,marginBottom:3,cursor:"pointer"}}><input type="radio" name="dtmSrc" checked={dtmSrc==="external"} onChange={()=>setDtmSrc("external")} style={{margin:0}}/>外部 DTM</label>
{dtmSrc==="external"&&(<><label style={{padding:"4px 8px",background:ac+"15",color:ac,border:`1px solid ${ac}44`,borderRadius:4,cursor:"pointer",fontSize:11,display:"inline-block",marginTop:4,marginBottom:4}}>📁 {extDTM?"更换 DTM":"选择 DTM"}<input type="file" accept=".tif,.tiff,.asc,.txt,.xyz,.csv" onChange={handleDTM} style={{display:"none"}}/></label><div style={{fontSize:10,color:txM,lineHeight:1.4}}>.tif (GeoTIFF)、.asc/.txt (ESRI) 或 .xyz/.csv (地面点)</div>{extDTM&&<div style={{fontSize:11,color:gn2,marginTop:3,fontWeight:600}}>✓ DTM {extDTM.w}×{extDTM.h}</div>}</>)}
</Sc>
<Sc t="信息"><div style={{fontSize:11,color:txM,lineHeight:1.8}}>
{[["Pts",`${(data.nOrig/1e6).toFixed(2)}M → ${(aP.x.length/1e3).toFixed(0)}K`],["Norm","✓ "+normRange],["Z raw",`${aB.z0.toFixed(1)}→${aB.z1.toFixed(1)}`],["X",`${aB.x0.toFixed(1)}→${aB.x1.toFixed(1)}`],["Y",`${aB.y0.toFixed(1)}→${aB.y1.toFixed(1)}`],["范围",`${((aB.x1-aB.x0)*(aB.y1-aB.y0)).toFixed(0)} m²`]].map(([k,v])=>
<div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k}</span><span style={{color:tx}}>{v}</span></div>)}</div></Sc>
<Sc t="导出"><button style={{...BT(true),width:"100%"}} onClick={hImg}>🖼 保存图像</button></Sc></>)}

{tab==="clip"&&view==="3d"&&<Sc t="样地裁剪"><div style={{fontSize:12,color:og,padding:8,background:og+"11",borderRadius:4}}>⚠ 2D</div></Sc>}
{tab==="clip"&&view==="2d"&&!clp&&(<Sc t="样地裁剪"><div style={{display:"flex",gap:4,marginBottom:6}}><button style={BT(cs==="circle")} onClick={()=>setCS("circle")}>⊚</button><button style={BT(cs==="rect")} onClick={()=>setCS("rect")}>◻</button></div>
<Rw l="半径 (m)"><input type="number" value={cr} onChange={e=>setCR(+e.target.value)} style={IN} min={1} max={500}/><input type="range" value={cr} onChange={e=>setCR(+e.target.value)} min={1} max={200} style={{flex:1}}/></Rw>
{cc&&<div style={{fontSize:11,color:txM}}>({cc.x.toFixed(1)}, {cc.y.toFixed(1)})</div>}
<button style={{...BT(!!cc),width:"100%",marginTop:4,opacity:cc?1:.35}} onClick={hClip} disabled={!cc}>✂ 执行裁剪</button></Sc>)}
{tab==="clip"&&clp&&<Sc t="样地裁剪"><div style={{color:gn2,fontSize:12}}>✓ {clp.x.length.toLocaleString()}</div></Sc>}

{tab==="seg"&&(<Sc t="单木分割">
<Rw l="格网 (m)"><input type="number" value={sCell} onChange={e=>setSCell(+e.target.value)} style={IN} min={.1} max={5} step={.1}/></Rw>
<Rw l="最低树高"><input type="number" value={sMinH} onChange={e=>setSMinH(+e.target.value)} style={IN} min={.5} max={15} step={.5}/></Rw>
<Rw l="搜索半径"><input type="number" value={sSR} onChange={e=>setSSR(+e.target.value)} style={IN} min={.5} max={20} step={.5}/></Rw>
<div style={{marginTop:6,paddingTop:6,borderTop:`1px solid ${bd}`}}>
<div style={{fontSize:11,color:txM,marginBottom:4,fontWeight:600}}>窗口模式</div>
<label style={{fontSize:12,color:tx,display:"flex",alignItems:"center",gap:4,marginBottom:3,cursor:"pointer"}}><input type="radio" name="wsMode" checked={!vwsMode} onChange={()=>setVwsMode(false)} style={{margin:0}}/>固定窗口（默认）</label>
<label style={{fontSize:12,color:tx,display:"flex",alignItems:"center",gap:4,marginBottom:3,cursor:"pointer"}}><input type="radio" name="wsMode" checked={vwsMode} onChange={()=>setVwsMode(true)} style={{margin:0}}/>VWS (Popescu & Wynne 2004)</label>
{vwsMode&&(<select value={vwsPreset} onChange={e=>setVwsPreset(e.target.value)} style={{...IN,width:"100%",marginTop:3}}><option value="pine">松树 / 针叶林</option><option value="deciduous">阔叶树 / 阔叶林</option><option value="combined">混合（混交林）</option><option value="linear_boreal">线性（北方林经验式）</option><option value="custom">自定义（立地特定）</option></select>)}
{vwsMode&&vwsPreset==="custom"&&(<div style={{marginTop:5,padding:6,background:ac+"0d",border:`1px solid ${bd}`,borderRadius:4}}>
<div style={{display:"flex",gap:6,marginBottom:4}}>
<label style={{fontSize:11,color:tx,display:"flex",alignItems:"center",gap:3,cursor:"pointer"}}><input type="radio" name="cvMode" checked={vwsCustom.mode==="linear"} onChange={()=>setVwsCustom({...vwsCustom,mode:"linear"})} style={{margin:0}}/>线性</label>
<label style={{fontSize:11,color:tx,display:"flex",alignItems:"center",gap:3,cursor:"pointer"}}><input type="radio" name="cvMode" checked={vwsCustom.mode==="quad"} onChange={()=>setVwsCustom({...vwsCustom,mode:"quad"})} style={{margin:0}}/>二次</label>
</div>
<div style={{fontSize:10,color:txM,marginBottom:4,fontStyle:"italic",lineHeight:1.3}}>{vwsCustom.mode==="linear"?"CW = clamp(a + b·H, min, max)":"CW = a + b·H + c·H²"}</div>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
<div style={{flex:"1 1 40%"}}><span style={{fontSize:10,color:txM}}>a</span><input type="number" step="0.001" value={vwsCustom.a} onChange={e=>setVwsCustom({...vwsCustom,a:e.target.value})} style={{...IN,width:"100%",padding:"2px 4px",fontSize:12}}/></div>
<div style={{flex:"1 1 40%"}}><span style={{fontSize:10,color:txM}}>b</span><input type="number" step="0.001" value={vwsCustom.b} onChange={e=>setVwsCustom({...vwsCustom,b:e.target.value})} style={{...IN,width:"100%",padding:"2px 4px",fontSize:12}}/></div>
{vwsCustom.mode==="quad"&&(<div style={{flex:"1 1 40%"}}><span style={{fontSize:10,color:txM}}>c</span><input type="number" step="0.0001" value={vwsCustom.c} onChange={e=>setVwsCustom({...vwsCustom,c:e.target.value})} style={{...IN,width:"100%",padding:"2px 4px",fontSize:12}}/></div>)}
{vwsCustom.mode==="linear"&&(<><div style={{flex:"1 1 40%"}}><span style={{fontSize:10,color:txM}}>min (m)</span><input type="number" step="0.5" value={vwsCustom.min} onChange={e=>setVwsCustom({...vwsCustom,min:e.target.value})} style={{...IN,width:"100%",padding:"2px 4px",fontSize:12}}/></div>
<div style={{flex:"1 1 40%"}}><span style={{fontSize:10,color:txM}}>max (m)</span><input type="number" step="0.5" value={vwsCustom.max} onChange={e=>setVwsCustom({...vwsCustom,max:e.target.value})} style={{...IN,width:"100%",padding:"2px 4px",fontSize:12}}/></div></>)}
</div></div>)}
</div>
<div style={{marginTop:6,paddingTop:6,borderTop:`1px solid ${bd}`}}>
<div style={{fontSize:11,color:txM,marginBottom:4,fontWeight:600}}>冠层投影</div>
<select value={crownMode} onChange={e=>setCrownMode(e.target.value)} style={{...IN,width:"100%"}}><option value="bbox">边界框（旧版）</option><option value="convex">凸包</option><option value="concave">凹包</option></select>
<div style={{fontSize:10,color:txM,marginTop:4,lineHeight:1.4,fontStyle:"italic"}}>ℹ 所有 CD/CPA 值（边界框 + 凸包）均列于 CSV</div>
</div>
<button style={{...BT(true),width:"100%",marginTop:8}} onClick={hSeg}>▶ 运行分割</button>
{segs&&<div style={{color:gn2,fontSize:12,marginTop:4}}>{met?`已测量 ${met.length} 棵树（${segs.count} 个段）`:`${segs.count} 个段`}</div>}
</Sc>)}

{tab==="volume"&&<VolumePanel metrics={met} summary={volumeSummary} applied={volumeConfig} draft={volumeDraft} onDraftChange={setVolumeDraft} bounds={aB} roi={clipRoi} onSegment={()=>setTab("seg")} onApply={hVolume} onExport={hVolumeCSV} onMetrics={()=>setTab("metrics")} onSpecies={()=>setTab("species")}/>}

{tab==="metrics"&&(<Sc t="单木指标">{!met?<div style={{fontSize:12,color:txD}}>请先运行分割</div>:(
<div style={{overflowX:"auto"}}><button style={{...BT(true),marginBottom:6,fontSize:11}} onClick={hCSV}>📥 CSV</button><button style={{...BT(false),marginLeft:8,marginBottom:6,fontSize:11}} onClick={()=>setTab("volume")}>蓄积评估 →</button><p className="workspace-sampling-note">表格显示前 200 棵树，CSV 导出与蓄积量统计包含全部单木指标记录。</p>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}><thead><tr>{["#","H","CD","X","Y","DBH₁","DBH₂","H₂","CD₂","V (m³)","N"].map(h=><th key={h} style={{textAlign:"left",padding:"2px",borderBottom:`1px solid ${bd}`,color:txD,fontWeight:500}}>{h}</th>)}</tr></thead>
<tbody>{met.slice(0,200).map((m,i)=>(<tr key={m.id} style={{background:sel===m.id?ac+"15":i%2===0?"transparent":bd+"22",cursor:"pointer"}} onClick={()=>{setSel(sel===m.id?null:m.id);setCMode("segment");}}>
<td style={{padding:"2px",color:CL[(m.id-1)%CL.length],fontWeight:700}}>{m.id}</td><td style={{padding:"2px"}}>{m.h.toFixed(1)}</td><td style={{padding:"2px"}}>{m.cd.toFixed(1)}</td>
<td style={{padding:"2px",fontSize:9}}>{m.cx.toFixed(1)}</td><td style={{padding:"2px",fontSize:9}}>{m.cy.toFixed(1)}</td><td style={{padding:"2px",color:m.dbhExtrapolated?og:gn2}} title={m.dbhStatus||"模型估算胸径（cm）"}>{m.dbhModel?.toFixed(1)||"–"}</td>
<td style={{padding:"1px"}}><input aria-label={`树 ${m.id} 实测胸径 cm`} type="number" min="0" step="any" value={m.dbhManual} onChange={e=>uMet(m.id,"dbhManual",e.target.value)} onClick={e=>e.stopPropagation()} style={{...IN,width:46,padding:"1px 2px"}}/></td>
<td style={{padding:"1px"}}><input aria-label={`树 ${m.id} 实测树高 m`} type="number" min="0" step="any" value={m.hManual} onChange={e=>uMet(m.id,"hManual",e.target.value)} onClick={e=>e.stopPropagation()} style={{...IN,width:46,padding:"1px 2px"}}/></td>
<td style={{padding:"1px"}}><input aria-label={`树 ${m.id} 实测冠幅 m`} type="number" min="0" step="any" value={m.cdManual} onChange={e=>uMet(m.id,"cdManual",e.target.value)} onClick={e=>e.stopPropagation()} style={{...IN,width:46,padding:"1px 2px"}}/></td>
<td style={{padding:"2px",color:gn2}} title={m.volumeStatus}>{Number.isFinite(m.volume)?m.volume.toFixed(4):"—"}</td><td style={{padding:"2px"}}>{m.cnt}</td></tr>))}</tbody></table>
{met.some(m=>GUIZHOU_MODELS.some(s=>s.id===m.modelId))&&<p className="workspace-sampling-note">贵州马尾松模型的 DBH₁ 为材积反推的间接估算（cm），橙色值超出文献样本范围；“—”表示输入无效或胸径超出 4–66 cm 求解范围。DBH₂、H₂、CD₂ 不参与 DBH₁ 推算；蓄积评估中可另选实测胸径和树高。</p>}
{met.some(m=>m.modelId===FIR_DBH_MODEL.id)&&<p className="workspace-sampling-note">杉木 DBH₁ 按东西、南北平均冠幅回归估算（cm）；橙色值超出 2.17–4.73 m 冠幅样本范围。“—”表示平均冠幅无效。模型来自湖南株洲，尚未在贵州校准；DBH₂ 用于实测对比，也可在蓄积评估中选择。</p>}
{met.some(m=>COMMON_SPECIES_MODELS.some(s=>s.id===m.modelId))&&<p className="workspace-sampling-note">华山松、云南松 DBH₁ 为云南样本树高曲线的间接反求值（cm），尚未在贵州校准。超出样本范围不输出；柏木、软阔、硬阔缺少已核实胸径模型，暂显示“—”。实测 DBH₂ 可用于精度对比和材积计算。</p>}
</div>)}</Sc>)}

{tab==="area"&&(<><Sc t="区域统计">
<button style={{...BT(true),width:"100%",marginBottom:4}} onClick={hArea}>📊 计算</button>
{areaMet&&<button style={{...BT(true),width:"100%",marginBottom:8,fontSize:11}} onClick={hAreaCSV}>📥 导出 CSV</button>}
{areaErr&&<div style={{fontSize:11,color:og,marginBottom:6,padding:4,background:og+"11",borderRadius:4}}>⚠ {areaErr}</div>}
{!areaMet&&!areaErr&&<div style={{fontSize:12,color:txD}}>请点击「计算」按钮</div>}
{areaMet&&(<div style={{fontSize:11,color:txM,lineHeight:2}}>
<div style={{fontSize:12,fontWeight:600,color:ac,marginBottom:4}}>高度百分位</div>
{[["H5",areaMet.h5],["H10",areaMet.h10],["H25",areaMet.h25],["H50",areaMet.h50],["H75",areaMet.h75],["H90",areaMet.h90],["H95",areaMet.h95],["H99",areaMet.h99]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k}</span><span style={{color:tx}}>{v.toFixed(2)} m</span></div>)}
<div style={{fontSize:12,fontWeight:600,color:ac,marginTop:8,marginBottom:4}}>统计量</div>
{[["平均",areaMet.h_mean,"m"],["最大",areaMet.h_max,"m"],["SD",areaMet.h_sd,"m"],["CV",areaMet.cv_h,"%"],["Skew",areaMet.skewness,""],["Kurt",areaMet.kurtosis,""],["IQR",areaMet.iqr,"m"]].map(([k,v,u])=><div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k}</span><span style={{color:tx}}>{v.toFixed(2)} {u}</span></div>)}
<div style={{fontSize:12,fontWeight:600,color:ac,marginTop:8,marginBottom:4}}>郁闭度 / 密度</div>
{[["D1",areaMet.d1],["D3",areaMet.d3],["D5",areaMet.d5],["D7",areaMet.d7],["D9",areaMet.d9],["CC₁.₃",areaMet.cc13]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k}</span><span style={{color:tx}}>{(v*100).toFixed(1)}%</span></div>)}
<div style={{fontSize:12,fontWeight:600,color:ac,marginTop:8,marginBottom:4}}>ITC</div>
{[["树木数",areaMet.itc_n],["最大",areaMet.itc_max.toFixed(1)+" m"],["最小",areaMet.itc_min.toFixed(1)+" m"],["平均",areaMet.itc_mean.toFixed(1)+" m"],["N/ha",areaMet.density.toFixed(0)]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k}</span><span style={{color:tx}}>{v}</span></div>)}
</div>)}</Sc><Sc t="蓄积评估汇总"><VolumeSummary summary={volumeSummary} configured={!!volumeConfig}/><button style={BT(false)} onClick={()=>setTab("volume")}>打开蓄积评估 →</button></Sc></>)}

{tab==="stats"&&(<Sc t="统计分析">{!met?<div style={{fontSize:12,color:txD}}>请先运行分割</div>:(()=>{
const wH=met.filter(m=>m.hManual!==""&&!isNaN(+m.hManual)),wC=met.filter(m=>m.cdManual!==""&&!isNaN(+m.cdManual)),wD=met.filter(m=>m.dbhManual!==""&&!isNaN(+m.dbhManual)&&m.dbhModel);
const SB=({l,s})=>!s?<div style={{fontSize:11,color:txD,marginBottom:6}}>{l}: 最少 3 个</div>:(
<div style={{marginBottom:8,padding:6,background:dk,borderRadius:4}}><div style={{fontSize:12,fontWeight:600,color:ac,marginBottom:4}}>{l} (n={s.n})</div>
<div style={{fontSize:11,color:txM,lineHeight:1.8}}>{[["RMSE",s.rmse],["Bias",s.bias],["R²",s.r2],["t",s.t],["p",s.p]].map(([k,v])=>
<div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k}</span><span style={{color:k==="p"?(v==="<0.001"?"#ef4444":+v<.05?og:gn2):tx}}>{v}</span></div>)}</div></div>);
return(<><div style={{fontSize:11,color:txD,marginBottom:8}}>输入手动测量值以计算一致性</div>
<SB l="H" s={cSt(wH.map(m=>({a:+m.hManual,b:m.h})))}/><SB l="CD" s={cSt(wC.map(m=>({a:+m.cdManual,b:m.cd})))}/><SB l="DBH" s={cSt(wD.map(m=>({a:+m.dbhManual,b:m.dbhModel})))}/></>);})()}</Sc>)}

{tab==="species"&&(<Sc t="树种"><select style={{...IN,width:"100%",marginBottom:6}} value={sp} onChange={e=>setSp(e.target.value)}>{SP.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
<div style={{fontSize:11,color:txD,marginBottom:6,padding:"4px 6px",background:dk,borderRadius:3,borderLeft:`2px solid ${ac}`}}>📖 {SP.find(s=>s.id===sp)?.ref||""}</div>
{COMMON_SPECIES_MODELS.find(s=>s.id===sp)&&(()=>{const model=COMMON_SPECIES_MODELS.find(s=>s.id===sp);return <div className="workspace-sampling-note">{model.available?<><p>{model.formula}。H 为点云树高（m），DBH₁ 为胸径（cm）。</p><p>样本范围：树高 {model.hMin}–{model.hMax} m，胸径 {model.dMin}–{model.dMax} cm。任一超范围时不输出数值。</p><p>文献原模型由胸径预测树高，这里作数学反求，未独立验证胸径预测精度，也未在贵州校准。</p><a href={model.sourceUrl} target="_blank" rel="noopener noreferrer">查看模型文献 ↗</a></>:<p style={{color:og}}>{model.reason}</p>}<p>另已核对并收录 {model.volumeModel.ref}，它需要已知胸径与树高，不能单独生成 DBH₁。</p><p style={{overflowWrap:"anywhere"}}>{model.volumeModel.formula}</p></div>;})()}
{sp===FIR_DBH_MODEL.id&&<div className="workspace-sampling-note"><p>{FIR_DBH_MODEL.area}</p><p>{FIR_DBH_MODEL.formula}。C 为东西、南北平均冠幅（m），DBH₁ 为胸径（cm）；使用平均冠幅而非凸包最大跨度，无需填写实测胸径。</p><p>文献冠幅样本范围为 2.17–4.73 m。超范围结果标色，仅供参考；建议用 DBH₂ 实测值检验。此模型不估算单木生物量或碳储量。</p><a href={FIR_DBH_MODEL.sourceUrl} target="_blank" rel="noopener noreferrer">查看胸径模型文献 ↗</a></div>}
{GUIZHOU_MODELS.find(s=>s.id===sp)&&(()=>{const model=GUIZHOU_MODELS.find(s=>s.id===sp);return <div className="workspace-sampling-note"><p>{model.area}</p><p>使用点云树高 H 与东西、南北平均冠幅 C，先按论文 M2 估算材积 V = 0.0001 × H^2.982 × C^0.007，再用对应产区公式反求 DBH₁（cm）。无需填写实测胸径。</p><p>这是间接估算方案，尚未用本地实测胸径验证。超出文献样本范围的结果会标色；超出 4–66 cm 求解范围时不输出数值。实测值不参与 DBH₁ 推算；可在蓄积评估模块选择实测胸径和树高。</p>{model.transferNote&&<p style={{color:og}}>{model.transferNote}</p>}</div>;})()}
{SP.find(s=>s.id===sp)?.experimental&&<div style={{fontSize:11,color:og,marginBottom:6,padding:"4px 6px",background:dk,borderRadius:3,borderLeft:`2px solid ${og}`,fontWeight:600}}>⚠ "BETA：该树种的土耳其校准系数尚未验证，结果仅供参考。"</div>}
{sp.startsWith("pb")&&<div style={{fontSize:11,color:gn2,marginBottom:6,padding:"4px 6px",background:dk,borderRadius:3,borderLeft:`2px solid ${gn2}`}}>🌲 "生物量：Sönmez et al. 2016"</div>}
<button style={{...BT(true),width:"100%"}} onClick={hSp} disabled={!met||met.length===0}>应用模型</button><button style={{...BT(false),width:"100%",marginTop:8}} onClick={hSpAndAssess} disabled={!met?.length}>应用并进入蓄积评估 →</button></Sc>)}

{tab==="transect"&&(<Sc t="垂直剖面"><div style={{fontSize:11,color:txD,marginBottom:6}}>在 2D 视图中点击 2 个点</div>
<button style={{...BT(!tMode),width:"100%",marginBottom:4}} onClick={()=>{setTMode(true);setTP1(null);setTP2(null);setTData(null);}}>✏ 绘制样线</button>
{tP1&&!tP2&&<div style={{fontSize:11,color:og}}>P1 ✓</div>}
{tData&&<div style={{fontSize:11,color:gn2}}>{tData.length} pts</div>}
<button style={{...BT(false),width:"100%",marginTop:4}} onClick={()=>{setTP1(null);setTP2(null);setTData(null);}}>🗑 清除</button>
<div style={{fontSize:10,color:txM,marginTop:8,padding:6,background:ac+"11",border:`1px solid ${ac}33`,borderRadius:4,lineHeight:1.4}}>ℹ 在 2D 视图中沿一条线选取 2 个点；下方将绘制垂直冠层剖面（含 1.3 m 参考线）。</div></Sc>)}
</div></aside></div><footer className="workspace-statusbar"><span><i/> 版权所有：{FORELAS_OWNER}</span><span>LAS · {fileName}</span><span>{FORELAS_NAME} {FORELAS_VERSION}</span></footer></div></>);}
function Sc({t,children}){return <section className="workspace-control-card"><h3>{t}</h3>{children}</section>;}
function Rw({l,children}){return <div className="workspace-control-row"><span>{l}</span>{children}</div>;}
