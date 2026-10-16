import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getTreeTops,getTreeMarkers,projectTreeMarkers,hitTreeLabel} from '../src/treeLabels.js';

test('tree label elevation uses raw canopy tops and ignores unsegmented or nonfinite points',()=>{
  const tops=getTreeTops({z:[100,113,119,NaN,121,120,Infinity]},[0,7,7,7,12,12,12]);
  assert.deepEqual([...tops],[[7,119],[12,121]]);
  assert.equal(getTreeTops(null,null).size,0);
});

test('labels preserve metric IDs and local origins, including zero-valued relative coordinates',()=>{
  const points={ox:500000,oy:3800000};
  const metrics=[{id:12,cxRel:0,cyRel:0,cx:999,cy:999},{id:7,cx:500012,cy:3800008},{id:99,cx:500001,cy:3800002}];
  const markers=getTreeMarkers(metrics,points,new Map([[7,119],[12,121]]));
  assert.deepEqual(markers,[{id:12,x:0,y:0,z:121},{id:7,x:12,y:8,z:119}]);
  assert.equal(metrics[0].cx,999);
});

test('top and side labels follow zoom and pan and use different world elevation axes',()=>{
  const marker=[{id:7,x:12,y:8,z:119}];
  const transform={oX:100,oY:250,sc:2,xMn:10,yMn:5};
  assert.deepEqual(projectTreeMarkers(marker,transform),[{id:7,x:104,y:244}]);
  assert.deepEqual(projectTreeMarkers(marker,{...transform,yMn:100},false),[{id:7,x:104,y:212}]);
  assert.deepEqual(projectTreeMarkers(marker,{...transform,oX:150,oY:220,sc:4}),[{id:7,x:158,y:208}]);
});

test('label hit testing chooses the last painted ID and handles empty or missed labels',()=>{
  const labels=[{id:7,left:10,top:20,right:50,bottom:42},{id:12,left:20,top:20,right:60,bottom:42}];
  assert.equal(hitTreeLabel(labels,30,30),12);
  assert.equal(hitTreeLabel(labels,12,30),7);
  assert.equal(hitTreeLabel(labels,90,30),null);
  assert.equal(hitTreeLabel([],0,0),null);
});

test('view markers include all metric records beyond the table preview limit',()=>{
  const metrics=Array.from({length:230},(_,i)=>({id:1000+i,cxRel:i,cyRel:i}));
  const tops=new Map(metrics.map(m=>[m.id,100+m.id]));
  const markers=getTreeMarkers(metrics,{ox:0,oy:0},tops);
  assert.equal(markers.length,230);
  assert.equal(markers.at(-1).id,1229);
});
