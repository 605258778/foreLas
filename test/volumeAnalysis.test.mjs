import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateTreeVolume,calculateVolumes,resolveVolumeArea,summarizeVolumes,volumeCSV,volumeReadiness} from '../src/volumeAnalysis.js';
import {treeMetricsCSV,areaMetricsCSV} from '../src/metricsExport.js';
import {REGIONAL_VOLUME_MODELS} from '../src/regionalVolumeModels.js';

const options={modelId:'pa_gz_volume',dbhSource:'model',heightSource:'point',areaOverride:''};
const bounds={x0:0,x1:20,y0:0,y1:20};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-11,`${actual} != ${expected}`);

test('single-tree volume and per-hectare stock agree with independent reference values',()=>{
  const metrics=calculateVolumes([{id:1,h:15,dbhModel:20},{id:2,h:15,dbhModel:20}],options);
  near(metrics[0].volume,0.24800392517542437);
  const summary=summarizeVolumes(metrics,bounds);
  near(summary.sum,0.49600785035084874);
  near(summary.perHa,12.4001962587712185);
  near(summary.mean,0.24800392517542437);
  assert.equal(summary.count,2);assert.equal(summary.coverage,100);
  assert.equal(summary.area,400);assert.equal(summary.areaSource,'bbox');
});

test('every regional model accepts explicit manual measurements with matching provenance',()=>{
  for(const model of REGIONAL_VOLUME_MODELS){
    const input={id:1,h:99,dbhModel:99,dbhManual:'20',hManual:'15'};
    const result=calculateTreeVolume(input,{...options,modelId:model.id,dbhSource:'manual',heightSource:'manual'});
    near(result.volume,model.volumeFn(20,15));
    assert.equal(result.volumeDbh,20);assert.equal(result.volumeHeight,15);
    assert.equal(result.volumeDbhSource,'manual');assert.equal(result.volumeHeightSource,'manual');
    assert.equal(result.volumeModelId,model.id);
    assert.equal(input.volume,undefined);
  }
});

test('manual-only inputs, blank fallback and invalid typed values stay distinct',()=>{
  const input=[{h:15,hManual:'15',dbhModel:30,dbhManual:'20'},
    {h:15,hManual:'15',dbhModel:20,dbhManual:''},{h:15,dbhModel:20,dbhManual:'-2'}];
  const copy=structuredClone(input);
  const manual=calculateVolumes(input,{...options,dbhSource:'manual',heightSource:'manual'});
  assert.deepEqual(volumeReadiness(input,{...options,dbhSource:'manual',heightSource:'manual'}),{total:3,diameter:1,height:2,ready:1});
  near(manual[0].volume,0.24800392517542437);
  assert.equal(manual[1].volume,null);assert.equal(manual[2].volume,null);
  const mixed=calculateVolumes(input,{...options,dbhSource:'preferManual'});
  assert.deepEqual(volumeReadiness(input,{...options,dbhSource:'preferManual'}),{total:3,diameter:2,height:3,ready:2});
  near(mixed[1].volume,manual[0].volume);
  assert.equal(mixed[1].volumeDbhSource,'model');
  assert.equal(mixed[2].volume,null,'an invalid non-empty manual value cannot silently fall back');
  assert.deepEqual(input,copy);
});

test('missing and nonpositive inputs remain absent and partial sums do not extrapolate',()=>{
  const invalid=[null,undefined,'',0,-2,NaN,Infinity,'bad',true];
  const results=calculateVolumes(invalid.map((v,id)=>({id,h:15,dbhModel:v})),options);
  assert.ok(results.every(t=>t.volume===null));
  for(const h of invalid)assert.equal(calculateTreeVolume({h,dbhModel:20},options).volume,null);
  const empty=summarizeVolumes(results,bounds);
  assert.equal(empty.sum,null);assert.equal(empty.mean,null);assert.equal(empty.perHa,null);
  const partial=summarizeVolumes([...results,{volume:0.25}],bounds);
  assert.equal(partial.missing,invalid.length);assert.equal(partial.sum,0.25);assert.equal(partial.perHa,6.25);
  assert.equal(summarizeVolumes([],bounds).sum,null);
});

test('measurement edits replace previous volume and preserve DBH model caveats',()=>{
  const initial=calculateTreeVolume({h:15,dbhModel:20,dbhManual:'20',dbhExtrapolated:true,dbhStatus:'间接反求，未校准'},options);
  assert.match(initial.volumeStatus,/超出.*样本/);assert.match(initial.volumeStatus,/未校准/);
  const edited=calculateTreeVolume({...initial,dbhManual:'25'},{...options,dbhSource:'manual'});
  assert.ok(edited.volume>initial.volume);assert.equal(edited.volumeDbh,25);
  assert.equal(calculateTreeVolume({...edited,dbhManual:''},{...options,dbhSource:'manual'}).volume,null);
});

test('stock area uses exact ROI geometry and measured overrides without clamping small plots',()=>{
  near(resolveVolumeArea(bounds,{shape:'circle',r:10}).area,Math.PI*100);
  assert.equal(resolveVolumeArea(bounds,{shape:'rect',r:10}).area,400);
  assert.equal(resolveVolumeArea(bounds,{shape:'circle',r:10},'100').area,100);
  assert.equal(resolveVolumeArea(bounds,null,'-10').area,null);
  assert.equal(resolveVolumeArea({x0:0,x1:0.5,y0:0,y1:1}).area,0.5);
  assert.equal(resolveVolumeArea({x0:1,x1:1,y0:0,y1:10}).area,null);
  assert.equal(resolveVolumeArea({x0:5,x1:0,y0:5,y1:0}).area,null);
  near(summarizeVolumes([{volume:1}],bounds,{shape:'circle',r:10}).perHa,100/Math.PI);
  assert.equal(summarizeVolumes([{volume:1}],null).perHa,null);
});

test('unknown model/source and invalid explicit area fail instead of reusing old results',()=>{
  for(const opts of [{modelId:'bad'},{dbhSource:'bad'},{heightSource:'toString'},{areaOverride:'0'},{areaOverride:'Infinity'}]){
    assert.throws(()=>calculateVolumes([{h:15,dbhModel:20}],{...options,...opts}));
  }
});

test('all CSV exports retain units, model provenance, missing values and unrounded totals',()=>{
  const metrics=calculateVolumes([{id:1,h:15,dbhModel:20,species:'树种,"A"\n样地'},{id:2,h:15}],options);
  const summary=summarizeVolumes(metrics,bounds);
  const csv=volumeCSV(metrics,summary,options);
  assert.match(csv,/Volume_m3,Volume_model_id,Volume_DBH_cm/);
  assert.match(csv,/2,,pa_gz_volume,,model,15,point/);
  assert.ok(csv.includes(`Volume_sum_m3,${metrics[0].volume}`));
  assert.match(csv,/Volume_missing_trees,1/);assert.match(csv,/Volume_area_m2,400/);
  const all=treeMetricsCSV(metrics,{area:400},summary,options);
  assert.ok(all.includes('"树种,""A""\n样地"'));
  assert.match(all,/AREA_METRICS/);assert.match(all,/VOLUME_SUMMARY/);
  assert.match(areaMetricsCSV({area:400},summary,options),/Volume_per_ha_m3/);
  assert.ok(!csv.includes('NaN')&&!csv.includes('undefined'));
  assert.ok(!treeMetricsCSV([{id:1}],null,summary,null).includes('VOLUME_SUMMARY'));
});
