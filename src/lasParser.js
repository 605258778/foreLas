// LAS 1.2-1.4 reader, point data record formats 0-10.
//
// Two details matter for correctness and are covered by test/lasParser.test.mjs:
//   - classification sits at byte 15 in the legacy formats 0-5 and at byte 16
//     in the 1.4 formats 6-10, where a flags byte precedes it;
//   - colour starts at byte 20 in format 2, byte 28 in formats 3 and 5, and
//     byte 30 in formats 7, 8 and 10.
//
// Coordinates are stored relative to a double-precision origin (ox, oy) so that
// large projected values keep their precision once cast to Float32. Callers that
// need absolute coordinates add the origin back.

// null keeps the original automatic sampling; 1-100 explicitly selects a percentage.
export function parseLAS(buf,samplePercent=null,progress=()=>{}){
if(samplePercent!==null&&(!Number.isInteger(samplePercent)||samplePercent<1||samplePercent>100))throw new Error("抽样百分比必须是 1–100 的整数");
const dv=new DataView(buf);if(String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3))!=="LASF")throw new Error("Invalid LAS");
const vM=dv.getUint8(24),vN=dv.getUint8(25),off=dv.getUint32(96,true),fmt=dv.getUint8(104),rec=dv.getUint16(105,true);let n=dv.getUint32(107,true);if(vM===1&&vN>=4&&n===0)n=Number(dv.getBigUint64(247,true));
const xS=dv.getFloat64(131,true),yS=dv.getFloat64(139,true),zS=dv.getFloat64(147,true),xO=dv.getFloat64(155,true),yO=dv.getFloat64(163,true),zO=dv.getFloat64(171,true);
const hasRGB=[2,3,5,7,8,10].includes(fmt);let ro=20;if(fmt===3||fmt===5)ro=28;if(fmt>=7)ro=30;
// LAS 1.4 point formats 6-10: classification moved to byte 16 (byte 15 = classification flags)
const clOff=fmt>=6?16:15;
if(rec<20||!isFinite(rec))throw new Error("Invalid LAS: point record length="+rec);
const M=5e6,step=n>M?Math.ceil(n/M):1;
const cap=samplePercent===null?Math.ceil(n/step):Math.ceil(n*samplePercent/100);
const x=new Float32Array(cap),y=new Float32Array(cap),z=new Float32Array(cap),r=new Uint8Array(cap),g=new Uint8Array(cap),b=new Uint8Array(cap),it=new Uint16Array(cap),cl=new Uint8Array(cap);let idx=0;
// store x/y relative to a double-precision origin so large projected coords
// keep precision in Float32; origin kept for CSV export and DTM matching
let ox=null,oy=null;
for(let j=0;j<cap;j++){if(j%65536===0)progress(j/cap*100,"解析 LAS 点云与属性");const i=samplePercent===null?j*step:Math.floor(j*n/cap);const o=off+i*rec;if(o+20>buf.byteLength)break;const ax=dv.getInt32(o,true)*xS+xO,ay=dv.getInt32(o+4,true)*yS+yO;if(ox===null){ox=ax;oy=ay;}x[idx]=ax-ox;y[idx]=ay-oy;z[idx]=dv.getInt32(o+8,true)*zS+zO;
it[idx]=dv.getUint16(o+12,true);cl[idx]=dv.getUint8(o+clOff);if(hasRGB&&o+ro+6<=buf.byteLength){r[idx]=dv.getUint16(o+ro,true)>>8;g[idx]=dv.getUint16(o+ro+2,true)>>8;b[idx]=dv.getUint16(o+ro+4,true)>>8;}idx++;}
return{nOrig:n,n:idx,samplePercent,ver:`${vM}.${vN}`,format:"LAS",hasRGB,ox:ox||0,oy:oy||0,x:x.subarray(0,idx),y:y.subarray(0,idx),z:z.subarray(0,idx),r:r.subarray(0,idx),g:g.subarray(0,idx),b:b.subarray(0,idx),intensity:it.subarray(0,idx),classification:cl.subarray(0,idx)};}
