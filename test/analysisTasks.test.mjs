import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createAnalysisEngine} from "../src/analysisTasks.js";
import {parseLAS} from "../src/lasParser.js";

async function fileFixture(){return new File([await readFile(new URL("../test_data/test_fmt3.las",import.meta.url))],"test.las");}

test("background import preserves LAS attributes and reports normalization stages",async()=>{
  const execute=createAnalysisEngine(),file=await fileFixture(),events=[];
  const expected=parseLAS(await file.arrayBuffer(),100);
  const result=await execute("load",{file,samplePercent:100,dtmSrc:"auto"},(percent,stage)=>events.push({percent,stage}));
  assert.deepEqual(result.pts,expected);
  assert.equal(result.normalized.length,expected.n);
  assert.ok(result.normalized.every(v=>Number.isFinite(v)&&v>=0));
  assert.ok(events.some(e=>e.stage.includes("归一化")));
  assert.ok(events.every((e,i)=>Number.isFinite(e.percent)&&e.percent>=0&&e.percent<100&&(i===0||e.percent>=events[i-1].percent)));
});

test("background workflow uses the requested ROI and restores full data after reset",async()=>{
  const execute=createAnalysisEngine();
  const {pts}=await execute("load",{file:await fileFixture(),samplePercent:100,dtmSrc:"auto"});
  const crop=await execute("clip",{x:pts.x[0],y:pts.y[0],radius:2,shape:"circle"});
  assert.ok(crop.pts.x.length>0&&crop.pts.x.length<pts.n);
  for(let i=0;i<crop.pts.x.length;i++)assert.ok((crop.pts.x[i]-pts.x[0])**2+(crop.pts.y[i]-pts.y[0])**2<=4);
  const settings={cell:.5,minHeight:2,radius:1,vwsMode:false,vwsPreset:"pine",crownMode:"bbox"};
  const result=await execute("segment",{...settings,useClip:true});
  assert.equal(result.segments.labels.length,crop.pts.x.length);
  const full=await execute("segment",{...settings,useClip:false});
  assert.equal(full.segments.labels.length,pts.n);
  const area=await execute("area",{useClip:false,metrics:full.metrics});
  assert.equal(area.n_pts,pts.n);
  assert.equal(area.itc_n,full.metrics.length);
  const roi=await execute("area",{useClip:false,metrics:full.metrics,roi:{shape:"circle",r:2}});
  assert.equal(roi.area,Math.PI*4);
});

test("failed background tasks leave the last successful data usable",async()=>{
  const execute=createAnalysisEngine();
  await assert.rejects(execute("segment",{}),/导入/);
  const {pts}=await execute("load",{file:await fileFixture(),samplePercent:100});
  await assert.rejects(execute("load",{file:new File(["bad"],"bad.las"),samplePercent:100}));
  await assert.rejects(execute("clip",{x:1e6,y:1e6,radius:1,shape:"circle"}),/无点云/);
  await assert.rejects(execute("segment",{cell:0,radius:1,minHeight:2}),/有效/);
  const result=await execute("segment",{cell:.5,radius:1,minHeight:2,crownMode:"bbox"});
  assert.equal(result.segments.labels.length,pts.n);
});

test("DTM parsing and model application return independent results with progress",async()=>{
  const execute=createAnalysisEngine(),events=[];
  const dtm=await execute("dtm",{file:new File(["ncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\ncellsize 1\nNODATA_value -9999\n10 11\n12 13"],"ground.asc")},(...e)=>events.push(e));
  assert.deepEqual(Array.from(dtm.data),[10,11,12,13]);
  assert.ok(events.some(e=>e[1].includes("格网")));
  const metrics=[{h:15,cd:4,dbhManual:"22",dbhModel:25,bm_total:100}];
  const result=await execute("species",{metrics,sp:"cf_dbh_pending"});
  assert.equal(result.metrics[0].dbhModel,null);
  assert.equal(result.metrics[0].dbhManual,"22");
  assert.equal(result.metrics[0].bm_total,undefined);
  assert.equal(metrics[0].dbhModel,25);
});

test("volume background task validates inputs and reports progress with independent results",async()=>{
  const execute=createAnalysisEngine(),events=[];
  const options={modelId:"pa_gz_volume",dbhSource:"manual",heightSource:"manual",areaOverride:"400"};
  const input=[{id:1,h:30,dbhModel:40,hManual:"15",dbhManual:"20"},{id:2,h:30,dbhManual:""}];
  const result=await execute("volume",{metrics:input,options},(...e)=>events.push(e));
  assert.ok(Math.abs(result.metrics[0].volume-0.24800392517542437)<1e-12);
  assert.equal(result.metrics[1].volume,null);
  assert.equal(input[0].volume,undefined);
  assert.ok(events.some(([,stage])=>stage.includes("材积")));
  await assert.rejects(execute("volume",{metrics:[],options}),/分割/);
  await assert.rejects(execute("volume",{metrics:input,options:{...options,modelId:"bad"}}),/模型/);
});

test("changing DBH models recomputes configured volumes and clears unsupported predictions",async()=>{
  const execute=createAnalysisEngine(),events=[];
  const volumeOptions={modelId:"cl_gz_general",dbhSource:"model",heightSource:"point"};
  const initial=[{id:1,h:15,cd:3,cdBbox:3,dbhModel:40,volume:999,hManual:"12",dbhManual:"20"}];
  const fir=await execute("species",{metrics:initial,sp:"cl_crown_lin2004",volumeOptions},(...e)=>events.push(e));
  assert.ok(fir.metrics[0].volume>0&&fir.metrics[0].volume<1);
  assert.equal(fir.metrics[0].volumeDbh,fir.metrics[0].dbhModel);
  assert.equal(fir.metrics[0].volumeModelId,"cl_gz_general");
  assert.ok(events.every((e,i)=>i===0||e[0]>=events[i-1][0]));
  const missing=await execute("species",{metrics:fir.metrics,sp:"cf_dbh_pending",volumeOptions});
  assert.equal(missing.metrics[0].volume,null);
  const manual=await execute("species",{metrics:fir.metrics,sp:"cf_dbh_pending",volumeOptions:{...volumeOptions,dbhSource:"manual"}});
  assert.ok(manual.metrics[0].volume>0);
  assert.equal(manual.metrics[0].volumeDbh,20);
  assert.equal(initial[0].volume,999);
});
