import{useState,useRef,useEffect,useCallback}from"react";
import*as THREE from"three";

import{parseLAS}from"./lasParser.js";


// ASPRS classification colours (ground, low/med/high vegetation, building, water)
const CLS_COL={0:[0.6,0.6,0.6],1:[0.7,0.7,0.7],2:[0.65,0.45,0.25],3:[0.55,0.75,0.35],
4:[0.35,0.65,0.25],5:[0.15,0.5,0.15],6:[0.8,0.45,0.4],7:[0.9,0.3,0.3],9:[0.25,0.5,0.85]};
const clsCol=c=>CLS_COL[c]||[0.5,0.5,0.5];
// --- core ---
function gB(p){let x0=1/0,x1=-1/0,y0=1/0,y1=-1/0,z0=1/0,z1=-1/0;for(let i=0;i<p.x.length;i++){if(p.x[i]<x0)x0=p.x[i];if(p.x[i]>x1)x1=p.x[i];if(p.y[i]<y0)y0=p.y[i];if(p.y[i]>y1)y1=p.y[i];if(p.z[i]<z0)z0=p.z[i];if(p.z[i]>z1)z1=p.z[i];}return{x0,x1,y0,y1,z0,z1};}
function makeNorm(pts,cs=2){const b=gB(pts),cols=Math.ceil((b.x1-b.x0)/cs)+1,rows=Math.ceil((b.y1-b.y0)/cs)+1;const gnd=new Float32Array(rows*cols).fill(1/0);
for(let i=0;i<pts.x.length;i++){const c=Math.floor((pts.x[i]-b.x0)/cs),r=Math.floor((pts.y[i]-b.y0)/cs);if(pts.z[i]<gnd[r*cols+c])gnd[r*cols+c]=pts.z[i];}
for(let p=0;p<3;p++)for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(gnd[r*cols+c]<1/0)continue;let s=0,n=0;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&gnd[nr*cols+nc]<1/0){s+=gnd[nr*cols+nc];n++;}}if(n)gnd[r*cols+c]=s/n;}
const z=new Float32Array(pts.x.length);for(let i=0;i<pts.x.length;i++){const c=Math.floor((pts.x[i]-b.x0)/cs),r=Math.floor((pts.y[i]-b.y0)/cs),v=gnd[r*cols+c];z[i]=v<1/0?pts.z[i]-v:pts.z[i]-b.z0;}return z;}
function clipP(pts,za,cx,cy,rad,sh){const idx=[];for(let i=0;i<pts.x.length;i++){const dx=pts.x[i]-cx,dy=pts.y[i]-cy;if(sh==="circle"?dx*dx+dy*dy<=rad*rad:Math.abs(dx)<=rad&&Math.abs(dy)<=rad)idx.push(i);}
const o={x:new Float32Array(idx.length),y:new Float32Array(idx.length),z:new Float32Array(idx.length),r:new Uint8Array(idx.length),g:new Uint8Array(idx.length),b:new Uint8Array(idx.length),intensity:new Uint16Array(idx.length),classification:new Uint8Array(idx.length),hasRGB:pts.hasRGB,ox:pts.ox||0,oy:pts.oy||0};const zo=new Float32Array(idx.length);
idx.forEach((j,i)=>{o.x[i]=pts.x[j];o.y[i]=pts.y[j];o.z[i]=pts.z[j];o.r[i]=pts.r[j];o.g[i]=pts.g[j];o.b[i]=pts.b[j];o.intensity[i]=pts.intensity[j];o.classification[i]=pts.classification[j];zo[i]=za[j];});return{pts:o,zN:zo};}
function runSeg(pts,za,cell,minH,sr,vwsMode,vwsPreset,customCoef){if(!pts.x.length)return{labels:new Int32Array(0),count:0};const b=gB(pts),cols=Math.ceil((b.x1-b.x0)/cell)+1,rows=Math.ceil((b.y1-b.y0)/cell)+1;const chm=new Float32Array(rows*cols).fill(-1);
for(let i=0;i<pts.x.length;i++){const c=Math.floor((pts.x[i]-b.x0)/cell),r=Math.floor((pts.y[i]-b.y0)/cell);if(za[i]>chm[r*cols+c])chm[r*cols+c]=za[i];}
const sm=new Float32Array(rows*cols);for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){let s=0,n=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&chm[nr*cols+nc]>=0){s+=chm[nr*cols+nc];n++;}}sm[r*cols+c]=n?s/n:-1;}
const coef=vwsMode?(vwsPreset==="custom"&&customCoef?customCoef:(VWS[vwsPreset]||VWS.pine)):null;const sc=Math.ceil(sr/cell),seeds=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const h=sm[r*cols+c];if(h<minH)continue;
const r2=coef?vwsRadiusPx(h,cell,coef):sc;let mx=true;for(let dr=-r2;dr<=r2&&mx;dr++)for(let dc=-r2;dc<=r2&&mx;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&sm[nr*cols+nc]>h)mx=false;}if(mx)seeds.push({r,c,h});}
if(!seeds.length)return{labels:new Int32Array(pts.x.length),count:0};const cl2=new Int32Array(rows*cols);seeds.forEach((s,i)=>{cl2[s.r*cols+s.c]=i+1;});
const ord=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(sm[r*cols+c]>=minH)ord.push({r,c,h:sm[r*cols+c]});ord.sort((a,b2)=>b2.h-a.h);
for(let p=0;p<8;p++){let ch=false;for(const{r,c}of ord){const k=r*cols+c;if(cl2[k])continue;let best=0,bh=-1;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols){const nk=nr*cols+nc;if(cl2[nk]&&sm[nk]>bh){bh=sm[nk];best=cl2[nk];}}}if(best){cl2[k]=best;ch=true;}}if(!ch)break;}
const labels=new Int32Array(pts.x.length);for(let i=0;i<pts.x.length;i++){if(za[i]<minH)continue;const c=Math.floor((pts.x[i]-b.x0)/cell),r=Math.floor((pts.y[i]-b.y0)/cell);labels[i]=cl2[r*cols+c];}
const u=new Set(labels);u.delete(0);const rm=new Map();let seq=1;for(const v of u)rm.set(v,seq++);for(let i=0;i<labels.length;i++)labels[i]=rm.get(labels[i])||0;return{labels,count:seq-1};}
function makeMet(pts,za,labels,cnt,crownMode){if(!cnt)return[];const trees=[];for(let t=1;t<=Math.min(cnt,5000);t++){let x0=1/0,x1=-1/0,y0=1/0,y1=-1/0,hM=0,c=0;const tpts=[];
for(let i=0;i<pts.x.length;i++){if(labels[i]!==t)continue;c++;tpts.push([pts.x[i],pts.y[i]]);if(pts.x[i]<x0)x0=pts.x[i];if(pts.x[i]>x1)x1=pts.x[i];if(pts.y[i]<y0)y0=pts.y[i];if(pts.y[i]>y1)y1=pts.y[i];if(za[i]>hM)hM=za[i];}
if(c<5)continue;
const cdBbox=((x1-x0)+(y1-y0))/2,cpaBbox=Math.PI/4*(x1-x0)*(y1-y0);
let cd=cdBbox,cpa=cpaBbox,cdConvex=null,cpaConvex=null,cdConcave=null,cpaConcave=null,actualMode=crownMode||"bbox";
// Subsample if too many points (concave hull is O(n²))
const samplePts=tpts.length>500?tpts.filter((_,i)=>i%Math.ceil(tpts.length/500)===0):tpts;
if((crownMode==="convex"||crownMode==="concave")&&samplePts.length>=3){const hull=convexHull(samplePts);cpaConvex=polyArea(hull);cdConvex=hullMaxD(hull);}
if(crownMode==="concave"&&samplePts.length>=4){const ch=concaveHull(samplePts,3);if(ch&&ch.length>=3){const a=polyArea(ch);
// concave hull area can't exceed convex hull area; clamp if it does
if(cpaConvex&&a>cpaConvex*1.01){cd=cdConvex;cpa=cpaConvex;actualMode="convex_fallback_invalid_concave";}
else{cpaConcave=a;cdConcave=hullMaxD(ch);cd=cdConcave;cpa=cpaConcave;}}else{cd=cdConvex;cpa=cpaConvex;actualMode="convex_fallback";}}
else if(crownMode==="convex"){cd=cdConvex;cpa=cpaConvex;}
// absolute centre coords (origin + relative) for CSV export and DTM matching
const _ox=pts.ox||0,_oy=pts.oy||0;
trees.push({id:t,cnt:c,h:hM,cd:cd,cpa:cpa,cdBbox:cdBbox,cpaBbox:cpaBbox,cdConvex:cdConvex,cpaConvex:cpaConvex,cdConcave:cdConcave,cpaConcave:cpaConcave,crownMethod:actualMode,cx:_ox+(x0+x1)/2,cy:_oy+(y0+y1)/2,cxRel:(x0+x1)/2,cyRel:(y0+y1)/2,dbhManual:"",hManual:"",cdManual:""});}trees.sort((a,b2)=>b2.cnt-a.cnt);return trees;}
function makeArea(pts,za,mets,roi){if(!pts||!za)return"E1";if(pts.x.length<10)return"E2";if(za.length!==pts.x.length)return"E3";
const h=[];for(let i=0;i<za.length;i++)if(za[i]>0.5&&isFinite(za[i]))h.push(za[i]);if(h.length<5)return"E4:"+h.length;
h.sort((a,b2)=>a-b2);const n=h.length,p=v=>h[Math.min(n-1,Math.floor(n*v/100))],mn=h.reduce((s,v)=>s+v,0)/n;
const va=n>1?h.reduce((s,v)=>s+(v-mn)**2,0)/(n-1):0,sd=Math.sqrt(va),cv=mn>0?sd/mn*100:0;
const m4=h.reduce((s,v)=>s+(v-mn)**4,0)/n,ku=va>0?m4/va**2-3:0;
const m3=h.reduce((s,v)=>s+(v-mn)**3,0)/n,sk=va>0?m3/va**1.5:0;
const dr=t=>{let a=0;for(let i=0;i<za.length;i++)if(za[i]>t&&isFinite(za[i]))a++;return za.length>0?a/za.length:0;};
// use the real ROI area for density (circle -> pi*r^2), else the bounding box
const bb=gB(pts);let area;let areaSrc;
if(roi&&roi.shape==="circle"&&roi.r>0){area=Math.PI*roi.r*roi.r;areaSrc="circle";}
else if(roi&&roi.shape==="rect"&&roi.r>0){area=(2*roi.r)*(2*roi.r);areaSrc="rect";}
else{area=Math.max((bb.x1-bb.x0)*(bb.y1-bb.y0),1);areaSrc="bbox";}
area=Math.max(area,1);const iN=mets?mets.length:0;
return{n_pts:pts.x.length,n_veg:n,area,area_source:areaSrc,h5:p(5),h10:p(10),h25:p(25),h50:p(50),h75:p(75),h90:p(90),h95:p(95),h99:p(99),h_mean:mn,h_max:h[n-1],h_sd:sd,cv_h:cv,skewness:sk,kurtosis:ku,iqr:p(75)-p(25),variance:va,
d1:dr(p(10)),d3:dr(p(30)),d5:dr(p(50)),d7:dr(p(70)),d9:dr(p(90)),cc13:dr(1.3),itc_n:iN,itc_max:iN>0?Math.max(...mets.map(m=>m.h)):0,itc_min:iN>0?Math.min(...mets.map(m=>m.h)):0,itc_mean:iN>0?mets.reduce((s,m)=>s+m.h,0)/iN:0,density:iN>0?iN/area*10000:0};}
function exTr(pts,za,p1,p2,w=2){const dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.sqrt(dx*dx+dy*dy);if(len<.1)return[];const nx=-dy/len,ny=dx/len,res=[];
for(let i=0;i<pts.x.length;i++){const px=pts.x[i]-p1.x,py=pts.y[i]-p1.y;const al=(px*dx+py*dy)/len,pe=Math.abs(px*nx+py*ny);if(al>=0&&al<=len&&pe<=w/2)res.push({dist:al,zN:za[i]});}res.sort((a,b2)=>a.dist-b2.dist);return res;}

// Variable Window Size (VWS) — Popescu & Wynne (2004) PE&RS 70(5):589-604
// Formulas predict CROWN WIDTH (m) from canopy height (m). Window side = CW.
// Pine:      CW = 3.75105 - 0.17919·H + 0.01241·H²
// Deciduous: CW = 3.09632 + 0.00895·H²
// Combined:  CW = 2.51503 + 0.00901·H²
// Linear (boreal-tuned): empirically derived for short-stature boreal taiga,
//   ws(H) = clamp(0.05·H + 2.5, 2, 5) — outperformed Popescu presets on EN23611_2
const VWS={
pine:{a:3.75105,b:-0.17919,c:0.01241,name:"Pine (P&W 2004 coniferous)",linear:false},
deciduous:{a:3.09632,b:0,c:0.00895,name:"Deciduous (P&W 2004 broadleaved)",linear:false},
combined:{a:2.51503,b:0,c:0.00901,name:"Combined (P&W 2004 mixed)",linear:false},
linear_boreal:{a:2.5,b:0.05,c:0,min:2,max:5,name:"Linear (boreal-tuned)",linear:true}
};
// build a VWS coefficient object from user-entered custom values
// quad: CW = a + b*H + c*H^2   linear: CW = clamp(a + b*H, min, max)
function customVWS(cc){const lin=cc.mode==="linear";return lin
?{a:+cc.a,b:+cc.b,c:0,min:+cc.min,max:+cc.max,name:"Custom (linear)",linear:true}
:{a:+cc.a,b:+cc.b,c:+cc.c,name:"Custom (quadratic)",linear:false};}
function vwsRadiusPx(H,cell,coef){if(!isFinite(H)||H<=0)return 1;let cw;
if(coef.linear){cw=Math.max(coef.min||2,Math.min(coef.max||5,coef.a+coef.b*H));}
else{cw=coef.a+coef.b*H+coef.c*H*H;}
return Math.max(1,Math.round((cw/2)/cell));}

// Convex hull — Andrew's monotone chain (O(n log n)), shoelace area, max diameter
function convexHull(pts){if(pts.length<3)return pts.slice();const s=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(O,A,B)=>(A[0]-O[0])*(B[1]-O[1])-(A[1]-O[1])*(B[0]-O[0]);const lo=[];for(const p of s){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}const up=[];for(let i=s.length-1;i>=0;i--){const p=s[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}lo.pop();up.pop();return lo.concat(up);}
function polyArea(p){let s=0;const n=p.length;for(let i=0;i<n;i++){s+=p[i][0]*p[(i+1)%n][1]-p[(i+1)%n][0]*p[i][1];}return Math.abs(s)/2;}
function hullMaxD(h){let m=0;for(let i=0;i<h.length;i++)for(let j=i+1;j<h.length;j++){const d=Math.hypot(h[i][0]-h[j][0],h[i][1]-h[j][1]);if(d>m)m=d;}return m;}

// Concave hull (Moreira & Santos 2007 KNN approach) — pure JS, no dependency
// Returns NULL if hull cannot be computed (then convex used as fallback)
function concaveHull(pts,kIn){if(pts.length<3)return null;if(pts.length===3)return pts.slice();
// Remove duplicates
const seen=new Set(),unique=[];for(const p of pts){const k=p[0]+","+p[1];if(!seen.has(k)){seen.add(k);unique.push(p);}}if(unique.length<3)return null;
const k=Math.min(Math.max(kIn||3,3),unique.length-1);
// Find starting point (lowest Y, leftmost X)
let start=0;for(let i=1;i<unique.length;i++)if(unique[i][1]<unique[start][1]||(unique[i][1]===unique[start][1]&&unique[i][0]<unique[start][0]))start=i;
const hull=[unique[start]];const dataset=unique.slice();dataset.splice(start,1);
let currentPoint=unique[start],previousAngle=0,step=2;
while((currentPoint!==unique[start]||step===2)&&dataset.length>0){
if(step===5)dataset.push(unique[start]);
// k-nearest neighbors
const kk=Math.min(k,dataset.length);const dists=dataset.map((p,i)=>({p,i,d:Math.hypot(p[0]-currentPoint[0],p[1]-currentPoint[1])}));dists.sort((a,b)=>a.d-b.d);
const kNearest=dists.slice(0,kk);
// Sort by right-hand turn angle
const angles=kNearest.map(n=>{let a=Math.atan2(n.p[1]-currentPoint[1],n.p[0]-currentPoint[0])-previousAngle;while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return{...n,angle:a};});angles.sort((a,b)=>b.angle-a.angle);
// Find first non-intersecting candidate
let found=false;for(const cand of angles){let intersects=false;for(let i=1;i<hull.length-1;i++){if(segIntersect(currentPoint,cand.p,hull[i-1],hull[i])){intersects=true;break;}}if(!intersects){hull.push(cand.p);previousAngle=Math.atan2(cand.p[1]-currentPoint[1],cand.p[0]-currentPoint[0]);currentPoint=cand.p;dataset.splice(dataset.indexOf(cand.p),1);found=true;break;}}
// If no valid candidate, increase k and restart
if(!found){if(k>=unique.length-1)return null;return concaveHull(pts,k+1);}
step++;if(step>5000)break;}
// Verify all points are inside or on hull (else increase k)
for(const p of unique){if(!pointInPolygon(p,hull)&&!pointOnPolygon(p,hull)){if(k>=unique.length-1)return null;return concaveHull(pts,k+1);}}
return hull;}
function segIntersect(p1,p2,p3,p4){const d=(p4[1]-p3[1])*(p2[0]-p1[0])-(p4[0]-p3[0])*(p2[1]-p1[1]);if(Math.abs(d)<1e-12)return false;const ua=((p4[0]-p3[0])*(p1[1]-p3[1])-(p4[1]-p3[1])*(p1[0]-p3[0]))/d;const ub=((p2[0]-p1[0])*(p1[1]-p3[1])-(p2[1]-p1[1])*(p1[0]-p3[0]))/d;return ua>1e-9&&ua<1-1e-9&&ub>1e-9&&ub<1-1e-9;}
function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
function pointOnPolygon(p,poly,eps=1e-6){for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];const da=Math.hypot(p[0]-a[0],p[1]-a[1]),db=Math.hypot(p[0]-b[0],p[1]-b[1]),dab=Math.hypot(a[0]-b[0],a[1]-b[1]);if(Math.abs(da+db-dab)<eps)return true;}return false;}

// External DTM — ESRI ASCII grid loader (.asc, .txt) + XYZ ground point cloud (.xyz, .csv)
// + GeoTIFF (.tif/.tiff) — single-band Float32/Int16 uncompressed, common case
// Bilinear interpolation for point normalization

// Minimal GeoTIFF parser — single-band, UNCOMPRESSED
// Supports: Float32, Float64, Int16, Int32, UInt8, UInt16 with ModelTiepointTag + ModelPixelScaleTag
// Limitations: no compression (LZW/DEFLATE), no tiled TIFFs (strip-only)
// Re-export your DTM as uncompressed: writeRaster(dtm, 'dtm.tif', gdal=c('COMPRESS=NONE','TILED=NO'))
async function parseGeoTIFF(buf){const dv=new DataView(buf);
// TIFF magic: II (little-endian, 0x4949) or MM (big-endian, 0x4D4D)
const endian=dv.getUint16(0,true);const le=endian===0x4949;if(endian!==0x4949&&endian!==0x4D4D)throw new Error("Not a TIFF file");
const magic=dv.getUint16(2,le);if(magic!==42)throw new Error("Not a TIFF (magic != 42)");
const ifdOffset=dv.getUint32(4,le);
const numEntries=dv.getUint16(ifdOffset,le);
// Parse IFD entries
const tags={};for(let i=0;i<numEntries;i++){const o=ifdOffset+2+i*12;const tag=dv.getUint16(o,le),type=dv.getUint16(o+2,le),count=dv.getUint32(o+4,le);
const sizes={1:1,2:1,3:2,4:4,5:8,11:4,12:8};const ts=sizes[type]||4;const dataSize=ts*count;
let value;if(dataSize<=4){value=o+8;}else{value=dv.getUint32(o+8,le);}
tags[tag]={type,count,offset:value,inline:dataSize<=4};}
// Required tags
const W=readTag(dv,tags[256],le);const H=readTag(dv,tags[257],le);const bps=readTag(dv,tags[258],le)||32;
const compression=readTag(dv,tags[259],le)||1;
if(compression!==1){const cMap={2:"CCITT",3:"CCITT Group 3",4:"CCITT Group 4",5:"LZW",6:"old JPEG",7:"JPEG",8:"DEFLATE",32773:"PackBits",34712:"JPEG2000"};const cName=cMap[compression]||"unknown";throw new Error(`Compressed GeoTIFF not yet supported (${cName}). Re-export uncompressed:\n  R/terra: writeRaster(dtm, 'dtm.tif', gdal=c('COMPRESS=NONE','TILED=NO'))\n  gdal_translate -co COMPRESS=NONE -co TILED=NO input.tif output.tif\n  Python/rasterio: dst.write(arr); profile['compress']='none'`);}
const samplesPerPixel=readTag(dv,tags[277],le)||1;if(samplesPerPixel!==1)throw new Error("Only single-band GeoTIFF supported");
const sampleFormat=readTag(dv,tags[339],le)||1; // 1=uint, 2=int, 3=float
const stripOffsets=readTagArray(dv,tags[273],le);const stripByteCounts=readTagArray(dv,tags[279],le);
const tileWidth=readTag(dv,tags[322],le);if(tileWidth)throw new Error("Tiled GeoTIFF not supported. Re-export with TILED=NO");
// Georeferencing
const pixelScale=readTagDoubles(dv,tags[33550],le);if(!pixelScale||pixelScale.length<2)throw new Error("Missing ModelPixelScaleTag");
const tiepoint=readTagDoubles(dv,tags[33922],le);if(!tiepoint||tiepoint.length<6)throw new Error("Missing ModelTiepointTag");
// origin: tiepoint[3], tiepoint[4] correspond to pixel (tiepoint[0], tiepoint[1])
const oX=tiepoint[3]-tiepoint[0]*pixelScale[0];const oY=tiepoint[4]+tiepoint[1]*pixelScale[1];
// nodata
let nodata=NaN;if(tags[42113]){const ndStr=readTagString(dv,tags[42113],le);const v=parseFloat(ndStr);if(isFinite(v))nodata=v;}
// Read raster data
const f=new Float32Array(W*H);let pos=0;
for(let s=0;s<stripOffsets.length;s++){const off=stripOffsets[s],cnt=stripByteCounts[s];const nPx=Math.floor(cnt/(bps/8));
for(let i=0;i<nPx&&pos<f.length;i++){let v;const bo=off+i*(bps/8);
if(sampleFormat===3&&bps===32)v=dv.getFloat32(bo,le);
else if(sampleFormat===3&&bps===64)v=dv.getFloat64(bo,le);
else if(sampleFormat===2&&bps===16)v=dv.getInt16(bo,le);
else if(sampleFormat===2&&bps===32)v=dv.getInt32(bo,le);
else if(sampleFormat===1&&bps===16)v=dv.getUint16(bo,le);
else if(sampleFormat===1&&bps===8)v=dv.getUint8(bo);
else throw new Error(`Unsupported pixel format: sampleFormat=${sampleFormat}, bps=${bps}`);
if(isFinite(nodata)&&v===nodata)v=NaN;f[pos++]=v;}}
return{w:W,h:H,oX:oX,oY:oY,px:pixelScale[0],py:pixelScale[1],data:f};}
function readTag(dv,tag,le){if(!tag)return null;const t=tag.type;if(tag.inline){if(t===3)return dv.getUint16(tag.offset,le);if(t===4)return dv.getUint32(tag.offset,le);if(t===1)return dv.getUint8(tag.offset);}else{if(t===3)return dv.getUint16(tag.offset,le);if(t===4)return dv.getUint32(tag.offset,le);}return null;}
function readTagArray(dv,tag,le){if(!tag)return[];const out=[];const t=tag.type;if(tag.count===1)return[readTag(dv,tag,le)];for(let i=0;i<tag.count;i++){const o=tag.offset+i*(t===3?2:4);if(t===3)out.push(dv.getUint16(o,le));else if(t===4)out.push(dv.getUint32(o,le));}return out;}
function readTagDoubles(dv,tag,le){if(!tag)return null;const out=[];for(let i=0;i<tag.count;i++){out.push(dv.getFloat64(tag.offset+i*8,le));}return out;}
function readTagString(dv,tag,le){if(!tag)return"";let s="";for(let i=0;i<tag.count-1;i++){s+=String.fromCharCode(dv.getUint8(tag.offset+i));}return s;}

function parseAsciiDTM(text){const lines=text.split(/\r?\n/);const hdr={};let hl=0;for(let i=0;i<lines.length;i++){const m=lines[i].trim().match(/^(\w+)\s+(\S+)/);if(!m||!/^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize|NODATA_value)$/i.test(m[1])){hl=i;break;}hdr[m[1].toLowerCase()]=parseFloat(m[2]);}
const nc=hdr.ncols,nr=hdr.nrows,xll=hdr.xllcorner??(hdr.xllcenter-hdr.cellsize/2),yll=hdr.yllcorner??(hdr.yllcenter-hdr.cellsize/2),cs=hdr.cellsize,nd=hdr.nodata_value??-9999;
const f=new Float32Array(nc*nr);let k=0;for(let i=hl;i<lines.length&&k<f.length;i++){const t=lines[i].trim().split(/\s+/);for(const v of t){if(v==="")continue;const x=parseFloat(v);f[k++]=(x===nd)?NaN:x;}}
return{w:nc,h:nr,oX:xll,oY:yll+nr*cs,px:cs,py:cs,data:f};}
function parseXYZdtm(text,cs=2){const out=[];for(const ln of text.split(/\r?\n/)){if(!ln||ln.startsWith("#"))continue;const t=ln.trim().split(/[\s,;]+/);if(t.length<3)continue;const x=parseFloat(t[0]),y=parseFloat(t[1]),z=parseFloat(t[2]);if(isFinite(x)&&isFinite(y)&&isFinite(z))out.push({x,y,z});}
if(!out.length)return null;let mnX=1/0,mxX=-1/0,mnY=1/0,mxY=-1/0;for(const p of out){if(p.x<mnX)mnX=p.x;if(p.x>mxX)mxX=p.x;if(p.y<mnY)mnY=p.y;if(p.y>mxY)mxY=p.y;}
const nc=Math.ceil((mxX-mnX)/cs)+1,nr=Math.ceil((mxY-mnY)/cs)+1,sum=new Float64Array(nc*nr),cnt=new Uint32Array(nc*nr);
for(const p of out){const cx=Math.floor((p.x-mnX)/cs),cy=Math.floor((mxY-p.y)/cs),k=cy*nc+cx;sum[k]+=p.z;cnt[k]+=1;}
const f=new Float32Array(nc*nr);for(let i=0;i<f.length;i++)f[i]=cnt[i]>0?sum[i]/cnt[i]:NaN;
// 3-pass NN gap fill
for(let pass=0;pass<3;pass++){const cp=f.slice();for(let y=0;y<nr;y++)for(let x=0;x<nc;x++){const k=y*nc+x;if(isFinite(f[k]))continue;let s=0,c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=nc||yy>=nr)continue;const v=cp[yy*nc+xx];if(isFinite(v)){s+=v;c++;}}if(c>0)f[k]=s/c;}}
return{w:nc,h:nr,oX:mnX,oY:mxY,px:cs,py:cs,data:f};}
function normWithDTM(pts,dtm){const N=pts.x.length,out=new Float32Array(N),ox=pts.ox||0,oy=pts.oy||0;for(let i=0;i<N;i++){const ax=ox+pts.x[i],ay=oy+pts.y[i];const px=(ax-dtm.oX)/dtm.px,py=(dtm.oY-ay)/dtm.py,x0=Math.floor(px),y0=Math.floor(py),x1=x0+1,y1=y0+1;
// Edge fallback: nearest cell within bounds
if(x0<0||y0<0||x1>=dtm.w||y1>=dtm.h){const xn=Math.max(0,Math.min(dtm.w-1,Math.round(px))),yn=Math.max(0,Math.min(dtm.h-1,Math.round(py)));const v=dtm.data[yn*dtm.w+xn];out[i]=isFinite(v)?pts.z[i]-v:NaN;continue;}
const dx=px-x0,dy=py-y0,w=dtm.w,v00=dtm.data[y0*w+x0],v10=dtm.data[y0*w+x1],v01=dtm.data[y1*w+x0],v11=dtm.data[y1*w+x1];
if(!isFinite(v00)||!isFinite(v10)||!isFinite(v01)||!isFinite(v11)){const c=[v00,v10,v01,v11].filter(isFinite);out[i]=c.length?pts.z[i]-c.reduce((a,b)=>a+b)/c.length:NaN;}
else{const a=v00*(1-dx)+v10*dx,b=v01*(1-dx)+v11*dx,g=a*(1-dy)+b*dy;out[i]=pts.z[i]-g;}}return out;}

// Species-specific allometric models — published coefficients
// All formulas return DBH in cm given H in m and CD in m
// Inverse-solving used for pure h-d models (Gompertz, Schnute, Prodan)
const SP=[
  // Gencal (2025) PhD thesis + Karahalil & Karsli (2017,)
  {id:"ps",name:"欧洲赤松 (P. sylvestris)",ref:"Gencal 2025",fn:(h,cd)=>Math.max(0,-5.22+1.65*h+2.35*cd)},
  {id:"ab",name:"博卢冷杉 (A. bornmuelleriana)",ref:"Gencal 2025",fn:(h,cd)=>Math.max(0,-6.27+1.80*h+2.06*cd)},
  // Özçelik et al. (2014) DOI:10.3906/TAR-1304-115 — Gompertz, inverse-solved for d
  // Formula: h = 1.3 + a·exp(-b·exp(-c·d))  →  d = -ln(-ln((h-1.3)/a)/b)/c
  {id:"pb_me",name:"海岸松-地中海型 (P. brutia ME)",ref:"Özçelik 2014",fn:(h,cd)=>{const a=22.527,b=1.823,c=0.062;if(h<=1.3||h>=a+1.3)return NaN;const inner=(h-1.3)/a;if(inner<=0||inner>=1)return NaN;const lni=-Math.log(inner)/b;if(lni<=0)return NaN;return Math.max(0,-Math.log(lni)/c);}},
  {id:"pb_ie",name:"黑海松-内陆型 (P. brutia IE)",ref:"Özçelik 2014",fn:(h,cd)=>{const a=25.911,b=2.004,c=0.045;if(h<=1.3||h>=a+1.3)return NaN;const inner=(h-1.3)/a;if(inner<=0||inner>=1)return NaN;const lni=-Math.log(inner)/b;if(lni<=0)return NaN;return Math.max(0,-Math.log(lni)/c);}},
  {id:"pb_le",name:"红松-湖泊型 (P. brutia LE)",ref:"Özçelik 2014",fn:(h,cd)=>{const a=24.207,b=1.465,c=0.038;if(h<=1.3||h>=a+1.3)return NaN;const inner=(h-1.3)/a;if(inner<=0||inner>=1)return NaN;const lni=-Math.log(inner)/b;if(lni<=0)return NaN;return Math.max(0,-Math.log(lni)/c);}},
  // Özçelik et al. (2014) — Pinus nigra Gompertz (Akdeniz sahil)
  {id:"pn",name:"欧洲黑松 (P. nigra)",ref:"Özçelik 2014",fn:(h,cd)=>{const a=23.494,b=2.397,c=0.067;if(h<=1.3||h>=a+1.3)return NaN;const inner=(h-1.3)/a;if(inner<=0||inner>=1)return NaN;const lni=-Math.log(inner)/b;if(lni<=0)return NaN;return Math.max(0,-Math.log(lni)/c);}},
  // Ercanli (2015) DOI:10.5154/R.RCHSCFA.2015.02.006 — Schnute, Kestel-Bursa
  // Assumes H_dom = max(H+1, 10) m and D_dom = 35 cm; inverse-solved numerically
  {id:"fo",name:"东方水青冈 (F. orientalis)",ref:"Ercanli 2015 (Kestel-Bursa)",fn:(h,cd)=>{const a=1.659,b=0.051,H0=Math.max(h+1,10),D0=35;let lo=0.1,hi=150;for(let i=0;i<40;i++){const d=(lo+hi)/2;const num=1-Math.exp(-b*d),den=1-Math.exp(-b*D0);const hPred=Math.pow(Math.pow(1.3,a)+(Math.pow(H0,a)-Math.pow(1.3,a))*num/den,1/a);if(hPred<h)lo=d;else hi=d;}return Math.max(0,(lo+hi)/2);}},
  // Carus & Akguş (2018) DOI:10.18182/tjf.338311 — Prodan 1968 rational (m8)
  // h = 1.30 + d² / (a + b·d + c·d²)
  // Tarsus region afforestation stands, n=5885 trees, Çizelge 4 (model dev dataset)
  // Verified: d=25.7 → h=8.54 (paper mean 8.4) — PHYSICALLY VALID
  // Inverse solved numerically via bisection on h
  {id:"pp",name:"意大利五针松 (P. pinea) [BETA]",ref:"Carus & Akguş 2018 (Tarsus)",fn:(h,cd)=>{
    if(h<=1.3)return NaN;
    const a=-8.922602,b=3.254666,c=0.025050;
    // Find d such that 1.30 + d²/(a + b·d + c·d²) = h
    let lo=0.5,hi=150;
    for(let i=0;i<60;i++){
      const d=(lo+hi)/2;
      const den=a+b*d+c*d*d;
      if(den<=0){lo=d;continue;}
      const hPred=1.30+d*d/den;
      if(isNaN(hPred)||hPred<h)lo=d;else hi=d;
    }
    return Math.max(0,(lo+hi)/2);
  }},
  // Cimini & Salvati (2011) — Q. cerris GADA site-index model, central Italy
  // h = Hdom · [(1-exp(b1·d))^b2 / (1-exp(b1·Ddom))^b2]
  // b1=-0.046, b2=0.650; defaults Hdom=25m, Ddom=40cm for mature Mediterranean stand
  // Proxy for Turkish Q. cerris (published Turkish coefs not yet available)
  {id:"qc",name:"土耳其栎 (Q. cerris) [BETA]",ref:"Cimini & Salvati 2011 (proxy)",experimental:true,fn:(h,cd)=>{
    if(h<=1.3)return NaN;
    const b1=-0.046,b2=0.650,Hdom=25,Ddom=40;
    const den=Math.pow(1-Math.exp(b1*Ddom),b2);
    // Find d such that Hdom · (1-exp(b1·d))^b2 / den = h
    let lo=0.5,hi=150;
    for(let i=0;i<60;i++){
      const d=(lo+hi)/2;
      const term=1-Math.exp(b1*d);
      if(term<=0){lo=d;continue;}
      const hPred=Hdom*Math.pow(term,b2)/den;
      if(isNaN(hPred)||hPred<h)lo=d;else hi=d;
    }
    return Math.max(0,(lo+hi)/2);
  }}
];

// Biomass models — Sönmez, Kahriman, Şahin, Yavuz (2016) for Pinus brutia
// Šumarski List 140(11-12), DOI:10.31298/SL.140.11-12.4
// Returns dry biomass in kg given DBH (d, cm) and height (h, m)
const BIOMASS={
  "pb":{
    branches:(d,h)=>Math.exp(-2.611+1.069*Math.log(d)+0.950*Math.log(h)),
    bark:(d,h)=>Math.exp(-3.254+1.314*Math.log(d)+0.878*Math.log(h)),
    stem:(d,h)=>Math.exp(-3.107+9.480*(d/(d+9.499))+0.070*h),
    needles:(d,h)=>Math.exp(-1.152+6.483*(d/(d+25.940))-0.017*h),
    total:(d,h)=>Math.exp(-0.770+7.829*(d/(d+12.843))+0.056*h)
  }
};
const CL=["#e6194b","#3cb44b","#ffe119","#4363d8","#f58231","#911eb4","#42d4f4","#f032e6","#bfef45","#fabed4","#469990","#dcbeff","#9A6324","#800000","#aaffc3","#808000"];
function hC(t){return[t<.5?0:(t-.5)*2,t<.5?t*2:(1-t)*2,t<.5?(.5-t)*2:0];}
function nS(r){if(r<=0)return 1;const raw=r/6,mg=10**Math.floor(Math.log10(raw)),n=raw/mg;return(n<1.5?1:n<3.5?2:n<7.5?5:10)*mg;}
function dlF(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);}

// --- citation ---
const FORA_VERSION="1.8.0";
const FORA_DOI="10.5281/zenodo.19546162";
const FORA_REPO="https://github.com/fora-platform/fora";
const FORA_BIBTEX=`@software{gencal_fora_2026,
  author    = {Gencal, Burhan},
  title     = {{三维激光点云林木分析系统}: A browser-based platform for {UAV-LiDAR} forest point cloud analysis},
  year      = {2026},
  version   = {v${FORA_VERSION}},
  publisher = {Zenodo},
  doi       = {${FORA_DOI}},
  url       = {https://doi.org/${FORA_DOI}}
}`;

function HeroPhoto(){return <img className="forest-background" src={import.meta.env.BASE_URL+"forest-lidar-4k.jpg"} alt="彩色单木分割森林点云，展示林冠与树木结构" fetchPriority="high"/>;}
const WORKSPACE_MODULES=[["tools","◈","数据与显示","点云属性与地面模型"],["clip","⌖","样地裁剪","圈定研究范围"],["seg","⌘","单木分割","冠层识别与窗口设置"],["metrics","▤","单木指标","树高、冠幅与实测值"],["area","▦","林分统计","高度分布与冠层覆盖"],["stats","⌁","精度评估","自动与实测结果对比"],["species","♧","树种模型","胸径与生物量估算"],["transect","⤴","垂直剖面","样线与冠层结构"]];

export default function App(){
const[data,setData]=useState(null);const[zN,setZN]=useState(null);const[bnd,setBnd]=useState(null);const[msg,setMsg]=useState("");
const[fileName,setFileName]=useState("");
const[cc,setCC]=useState(null);const[cr,setCR]=useState(15);const[cs,setCS]=useState("circle");
const[clp,setClp]=useState(null);const[clpZ,setClpZ]=useState(null);const[clpB,setClpB]=useState(null);
const[segs,setSegs]=useState(null);const[met,setMet]=useState(null);const[areaMet,setAreaMet]=useState(null);const[areaErr,setAreaErr]=useState("");
const[sel,setSel]=useState(null);const[sp,setSp]=useState("ps");const[cMode,setCMode]=useState("height");const[view,setView]=useState("2d");
const[ptSz,setPtSz]=useState(1.5);const[ptPct,setPtPct]=useState(100);const[sCell,setSCell]=useState(0.5);const[sMinH,setSMinH]=useState(2);const[sSR,setSSR]=useState(3);
const[vwsMode,setVwsMode]=useState(false);const[vwsPreset,setVwsPreset]=useState("pine");const[crownMode,setCrownMode]=useState("bbox");const[dtmSrc,setDtmSrc]=useState("auto");const[extDTM,setExtDTM]=useState(null);
const[vwsCustom,setVwsCustom]=useState({mode:"linear",a:2.5,b:0.05,c:0,min:2,max:5});
const[tab,setTab]=useState("tools");const[theme,setTheme]=useState("dark");const[pan,setPan]=useState({x:0,y:0});const[zoom,setZoom]=useState(1);
const[tMode,setTMode]=useState(false);const[tP1,setTP1]=useState(null);const[tP2,setTP2]=useState(null);const[tData,setTData]=useState(null);
const[showLaz,setShowLaz]=useState(true);const[showCite,setShowCite]=useState(false);const[citeCopied,setCiteCopied]=useState(false);
const topR=useRef(null),sideR=useRef(null),transR=useRef(null),threeR=useRef(null),cleanR=useRef(null);
const dragR=useRef({on:false,moved:false,sx:0,sy:0,px:0,py:0});
const dR=useRef(),zR=useRef(),cR=useRef(),czR=useRef(),mR=useRef();
dR.current=data;zR.current=zN;cR.current=clp;czR.current=clpZ;mR.current=met;
const cam3D=useRef({theta:Math.PI/4,phi:Math.PI/3.2,dist:0});
const aP=clp||data,aZ=clpZ||zN,aB=clp?clpB:bnd;
const dk=theme==="dark"?"#041510":"#f0f6f2",pn2=theme==="dark"?"#0b241c":"#ffffff",bd=theme==="dark"?"#28523e":"#cfdfd4";
const ac=theme==="dark"?"#9cf5bc":"#187548",gn2=theme==="dark"?"#86efac":"#237c4e",og=theme==="dark"?"#f5c578":"#97601d",tx=theme==="dark"?"#ecfff3":"#183526",txD=theme==="dark"?"#88aa98":"#647e6f",txM=theme==="dark"?"#b0cbbd":"#4c6b59";
const BT=on=>({padding:"8px 12px",background:on?ac+"1a":pn2,color:on?ac:txM,border:`1px solid ${on?ac+"66":bd}`,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:on?650:500});
const IN={padding:"7px 9px",background:dk,color:tx,border:`1px solid ${bd}`,borderRadius:6,fontSize:13,fontFamily:"inherit",width:76};
const normRange=aZ?(()=>{let mx=0;const st=Math.max(1,Math.floor(aZ.length/2000));for(let i=0;i<aZ.length;i+=st)if(aZ[i]>mx&&isFinite(aZ[i]))mx=aZ[i];return`0→${mx.toFixed(1)}m`;})():"–";
const hasTrans=tData&&tData.length>0;

const handleFile=useCallback(async e=>{const f=e.target.files[0];if(!f)return;
  if(f.name.toLowerCase().endsWith(".laz")){setMsg("⚠ 暂不支持 LAZ 格式");setShowLaz(true);return;}
  setMsg("加载中...");setCC(null);setClp(null);setClpZ(null);setClpB(null);setSegs(null);setMet(null);setAreaMet(null);setAreaErr("");setSel(null);setView("2d");setZN(null);setPan({x:0,y:0});setZoom(1);setTP1(null);setTP2(null);setTData(null);cam3D.current={theta:Math.PI/4,phi:Math.PI/3.2,dist:0};
  try{const buf=await f.arrayBuffer();const pts=parseLAS(buf);setData(pts);setFileName(f.name);setBnd(gB(pts));setMsg("归一化中...");await new Promise(r=>setTimeout(r,30));
    if(dtmSrc==="external"&&extDTM){
      // DTM elevation sanity check
      const lasB=gB(pts);let dtmMin=1/0,dtmMax=-1/0;for(let i=0;i<extDTM.data.length;i++){const v=extDTM.data[i];if(isFinite(v)){if(v<dtmMin)dtmMin=v;if(v>dtmMax)dtmMax=v;}}
      const lasMid=(lasB.z0+lasB.z1)/2,dtmMid=(dtmMin+dtmMax)/2,offset=Math.abs(lasMid-dtmMid);
      if(offset>50){setMsg(`⚠ DTM 高程范围 (${dtmMin.toFixed(0)}–${dtmMax.toFixed(0)} m) 与 LAS 数据 (${lasB.z0.toFixed(0)}–${lasB.z1.toFixed(0)} m) 不匹配，已改用自动归一化。`);
        setZN(makeNorm(pts));setDtmSrc("auto");}
      else{setZN(normWithDTM(pts,extDTM));setMsg(`✓ 已使用外部 DTM 归一化（偏移 ${offset.toFixed(1)} m）`);}
    }
    else{setZN(makeNorm(pts));setMsg("");}
    setTab("tools");
  }catch(err){setMsg("⚠ "+err.message);}},[dtmSrc,extDTM]);
const handleDTM=useCallback(async e=>{const f=e.target.files[0];if(!f)return;setMsg("DTM 加载中...");
  try{const name=f.name.toLowerCase();let dtm=null;
    if(name.endsWith(".tif")||name.endsWith(".tiff")){const buf=await f.arrayBuffer();dtm=await parseGeoTIFF(buf);}
    else if(name.endsWith(".asc")||name.endsWith(".txt")){const txt=await f.text();dtm=parseAsciiDTM(txt);}
    else if(name.endsWith(".xyz")||name.endsWith(".csv")){const txt=await f.text();dtm=parseXYZdtm(txt,2);}
    else{setMsg("⚠ 不支持的 DTM 格式 (.tif/.asc/.txt/.xyz/.csv)");return;}
    if(!dtm){setMsg("⚠ DTM 解析失败");return;}
    setExtDTM(dtm);setDtmSrc("external");setMsg(`✓ DTM 已加载（${dtm.w}×${dtm.h} 格网）`);
  }catch(err){setMsg("⚠ DTM: "+err.message);}},[]);
const hClip=useCallback(()=>{if(!data||!cc||!zN)return;const{pts:cp,zN:cz}=clipP(data,zN,cc.x,cc.y,cr,cs);if(!cp.x.length){setMsg("区域内无点云！");return;}setClp(cp);setClpZ(cz);setClpB(gB(cp));setSegs(null);setMet(null);setAreaMet(null);setAreaErr("");setPan({x:0,y:0});setZoom(1);},[data,zN,cc,cr,cs]);
const hSeg=useCallback(()=>{const pts=cR.current||dR.current,za=czR.current||zR.current;if(!pts||!za)return;setMsg("分割中...");setTimeout(()=>{const cCoef=vwsPreset==="custom"?customVWS(vwsCustom):null;const s=runSeg(pts,za,sCell,sMinH,sSR,vwsMode,vwsPreset,cCoef);setSegs(s);setCMode("segment");setMet(makeMet(pts,za,s.labels,s.count,crownMode));setMsg("");setTab("metrics");},50);},[sCell,sMinH,sSR,vwsMode,vwsPreset,vwsCustom,crownMode]);
const hArea=useCallback(()=>{const pts=cR.current||dR.current,za=czR.current||zR.current,m=mR.current;
// pass ROI geometry so density uses the true area, not the bounding box
const roi=(clp&&cc)?{shape:cs,r:cr}:null;
const r=makeArea(pts,za,m,roi);if(typeof r==="string"){setAreaErr(r);setAreaMet(null);}else{setAreaMet(r);setAreaErr("");}setMsg("");},[clp,cc,cs,cr]);
const hSp=useCallback(()=>{if(!met)return;const s=SP.find(x=>x.id===sp);const bioKey=sp.startsWith("pb")?"pb":null;const bio=bioKey?BIOMASS[bioKey]:null;setMet(prev=>prev.map(m=>{const d=s?s.fn(m.h,m.cd):null;const bioOut=(bio&&d&&d>0&&m.h>0)?{bm_total:bio.total(d,m.h),bm_stem:bio.stem(d,m.h),bm_branch:bio.branches(d,m.h),bm_bark:bio.bark(d,m.h),bm_needle:bio.needles(d,m.h)}:{};return{...m,dbhModel:d,species:s?.name,...bioOut};}));},[met,sp]);
const hCSV=useCallback(()=>{if(!met)return;let csv="ID,H_auto,CD_auto,CPA,CD_bbox,CD_convex,CD_concave,CPA_bbox,CPA_convex,CPA_concave,CrownMethod,CenterX,CenterY,DBH_model,H_manual,CD_manual,DBH_manual,Species,Biomass_total_kg,Biomass_stem_kg,Biomass_branch_kg,Biomass_bark_kg,Biomass_needle_kg,Points\n";csv+=met.map(m=>`${m.id},${m.h.toFixed(2)},${m.cd.toFixed(2)},${m.cpa.toFixed(2)},${m.cdBbox?.toFixed(2)||""},${m.cdConvex?.toFixed(2)||""},${m.cdConcave?.toFixed(2)||""},${m.cpaBbox?.toFixed(2)||""},${m.cpaConvex?.toFixed(2)||""},${m.cpaConcave?.toFixed(2)||""},${m.crownMethod||""},${m.cx.toFixed(2)},${m.cy.toFixed(2)},${m.dbhModel?.toFixed(1)||""},${m.hManual||""},${m.cdManual||""},${m.dbhManual||""},${m.species||""},${m.bm_total?.toFixed(2)||""},${m.bm_stem?.toFixed(2)||""},${m.bm_branch?.toFixed(2)||""},${m.bm_bark?.toFixed(2)||""},${m.bm_needle?.toFixed(2)||""},${m.cnt}`).join("\n");if(areaMet)csv+="\n\nAREA_METRICS\n"+Object.entries(areaMet).map(([k,v])=>`${k},${typeof v==="number"?v.toFixed(3):v}`).join("\n");dlF(new Blob(["\uFEFF"+csv],{type:"text/csv"}),"fora_tree_metrics.csv");},[met,areaMet]);
const hAreaCSV=useCallback(()=>{if(!areaMet)return;let csv="Metric,Value\n";Object.entries(areaMet).forEach(([k,v])=>{csv+=`${k},${typeof v==="number"?v.toFixed(4):v}\n`;});dlF(new Blob(["\uFEFF"+csv],{type:"text/csv"}),"fora_area_metrics.csv");},[areaMet]);
const hImg=useCallback(()=>{if(view==="3d"){const el=threeR.current;if(!el)return;const wc=el.querySelector("canvas");if(!wc)return;try{const url=wc.toDataURL("image/png");const a=document.createElement("a");a.href=url;a.download="fora_3d.png";document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(err){setMsg("Export failed");}
}else{const cv=topR.current;if(!cv)return;const W=cv.width,H=cv.height;const tmp=document.createElement("canvas");tmp.width=W;tmp.height=H;const ctx=tmp.getContext("2d");ctx.drawImage(cv,0,0);
const m=mR.current;if(m&&m.length>0&&cv._tr){const{oX,oY,sc,xMn,yMn}=cv._tr;const isDk=theme==="dark";ctx.font="bold 18px monospace";ctx.textAlign="center";ctx.textBaseline="middle";
m.forEach(t=>{const rx=t.cxRel!==undefined?t.cxRel:t.cx,ry=t.cyRel!==undefined?t.cyRel:t.cy;const px=oX+(rx-xMn)*sc,py=oY-(ry-yMn)*sc;if(px<0||px>W||py<0||py>H)return;ctx.fillStyle=isDk?"#000000cc":"#ffffffcc";ctx.beginPath();ctx.arc(px,py,12,0,Math.PI*2);ctx.fill();ctx.fillStyle=isDk?"#ffffff":"#000000";ctx.fillText(t.id,px,py);});}
ctx.font="bold 20px monospace";ctx.fillStyle=ac;ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText("三维激光点云林木分析系统",10,10);tmp.toBlob(blob=>{if(blob)dlF(blob,"fora_map.png");},"image/png");}},[view,theme]);
const uMet=useCallback((id,f,v)=>{setMet(prev=>prev.map(m=>m.id===id?{...m,[f]:v}:m));},[]);
const hReset=()=>{setClp(null);setClpZ(null);setClpB(null);setSegs(null);setMet(null);setAreaMet(null);setAreaErr("");setCC(null);setSel(null);setCMode("height");setPan({x:0,y:0});setZoom(1);setTP1(null);setTP2(null);setTData(null);};
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
if(!wd){if(tMode){if(!tP1)setTP1({x:wx,y:wy});else{setTP2({x:wx,y:wy});const pts=cR.current||dR.current,za=czR.current||zR.current;if(pts&&za)setTData(exTr(pts,za,tP1,{x:wx,y:wy},2));setTMode(false);}}
else if(!clp&&zN)setCC({x:wx,y:wy});}}
else if(act==="wheel"){e.preventDefault();setZoom(z=>Math.max(.1,Math.min(50,z*(e.deltaY>0?.9:1.1))));}
},[clp,zN,tMode,tP1,pan]);

// --- render ---
const hDrop=e=>{e.preventDefault();const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)handleFile({target:{files:[f]}});};
if(!data)return(
<main className="landing template-landing" style={{"--forest-image":`url("${import.meta.env.BASE_URL}forest-lidar-4k.jpg")`}} onDragOver={e=>e.preventDefault()} onDrop={hDrop}>
 <header className="landing-nav dashboard-topbar"><a className="brand" href="#home"><span className="brand-mark">F</span><span>激光点云林木分析系统<small>FOREST POINT CLOUD ANALYTICS</small></span></a><div className="nav-links"><a href={`https://doi.org/${FORA_DOI}`} target="_blank" rel="noopener noreferrer">ⓘ 帮助</a><button onClick={()=>setShowCite(s=>!s)}>⚙ 设置 / 引用</button><span className="user-chip"><i/> 本地分析工作区</span></div></header>
 <div className="dashboard-layout">
  <div className="dashboard-main">
   <section className="dashboard-hero" id="home"><div className="dashboard-hero-art"><HeroPhoto/></div><div className="dashboard-hero-copy"><div className="eyebrow"><span/> UAV · LiDAR · FOREST INTELLIGENCE</div><h1>让每一片森林<br/><em>都清晰可读。</em></h1><p className="hero-lede">基于激光雷达点云数据的单木分割与林木参数提取平台，提供从数据导入、预处理、单木分割到参数计算与可视化的一站式分析体验。</p><div className="hero-actions"><label className="primary-cta"><span>▰　导入点云数据</span><b>→</b><input type="file" accept=".las,.laz" onChange={handleFile}/></label><a className="hero-secondary" href="#capabilities">查看分析能力 ↗</a></div>{msg&&<div className="landing-message" role="status">{msg}</div>}<div className="hero-trust"><span>支持 LAS 1.2–1.4</span><span>本地文件读取</span><span>单木分割与参数提取</span></div></div></section>
   <section className="workflow-panel" id="workflow"><div className="panel-title"><div><small>FROM POINT CLOUD TO INSIGHT</small><h2>分析流程</h2></div><span>从原始点云到林分指标</span></div><div className="workflow-steps">{[["1","导入点云数据","LAS 文件解析"],["2","点云预处理","高度归一化与裁剪"],["3","单木分割","CHM 与可变窗口"],["4","参数提取","树高、冠幅、DBH"],["5","结果导出","指标表与统计"]].map(([n,t,d],i)=><div className="workflow-step" key={n}><i>{n}</i><span><b>{t}</b><small>{d}</small></span>{i<4&&<em>›</em>}</div>)}</div></section>
   <div className="dashboard-lower"><section className="capabilities" id="capabilities"><div className="panel-title"><div><small>ANALYSIS MODULES</small><h2>平台分析能力</h2></div><span>研究级森林结构分析</span></div><div className="cap-grid">{[["01","◌","点云解析","LAS 分类、强度与 RGB 属性"],["02","⌘","单木分割","冠层模型与可变窗口区域生长"],["03","⌖","林分统计","高度分位数、密度与冠层覆盖"],["04","⌁","生态估算","树种模型、DBH 与生物量"]].map(([n,icon,title,desc])=><article className="cap-card" key={n}><div className={"cap-thumbnail cap-thumbnail-"+n} aria-hidden="true"/><div className="cap-info"><div className="cap-top"><span>{n}</span><b>{icon}</b></div><h3>{title}</h3><p>{desc}</p></div></article>)}</div></section>
    <aside className="quick-panel" id="research"><div className="panel-title"><div><small>QUICK START</small><h2>快速开始</h2></div></div><div className="quick-intro">先选择地面归一化模型，再导入 LAS 点云。</div><div className="ground-choices"><label className={dtmSrc==="auto"?"ground-choice chosen":"ground-choice"}><input type="radio" name="dtmSrcL" checked={dtmSrc==="auto"} onChange={()=>setDtmSrc("auto")}/><span><b>自动地面模型</b><small>网格最低点估计</small></span></label><label className={dtmSrc==="external"?"ground-choice chosen":"ground-choice"}><input type="radio" name="dtmSrcL" checked={dtmSrc==="external"} onChange={()=>setDtmSrc("external")}/><span><b>外部 DTM</b><small>GeoTIFF / ASCII / XYZ</small></span></label>{dtmSrc==="external"&&<label className="dtm-upload">{extDTM?`已载入 ${extDTM.w} × ${extDTM.h}`:"选择地面模型文件"}<input type="file" accept=".tif,.tiff,.asc,.txt,.xyz,.csv" onChange={handleDTM}/></label>}</div><label className="secondary-cta"><span>＋　选择 LAS 文件</span><input type="file" accept=".las,.laz" onChange={handleFile}/></label><p className="quick-note">数据仅在当前设备中读取和计算。</p></aside></div>
   <footer className="landing-footer"><span>© FORA {FORA_VERSION} · Forest point cloud analytics</span><span className="footer-local">数据不离开本机</span><div/><a href={`https://doi.org/${FORA_DOI}`} target="_blank" rel="noopener noreferrer">DOI</a><a href={FORA_REPO} target="_blank" rel="noopener noreferrer">GitHub</a><button onClick={()=>setShowCite(s=>!s)}>引用</button></footer>{showCite&&<div className="citation-panel"><div className="citation-head"><b>BibTeX</b><button onClick={()=>{navigator.clipboard?.writeText(FORA_BIBTEX).then(()=>{setCiteCopied(true);setTimeout(()=>setCiteCopied(false),1500);});}}>{citeCopied?"已复制":"复制"}</button></div><pre>{FORA_BIBTEX}</pre></div>}
  </div>
 </div>
</main>);return(
<div className={"analysis-workspace workspace-"+theme} style={{"--ws-bg":dk,"--ws-panel":pn2,"--ws-line":bd,"--ws-accent":ac,"--ws-text":tx,"--ws-muted":txD,"--ws-secondary":txM}} onDragOver={e=>e.preventDefault()} onDrop={hDrop}>
 <header className="workspace-header">
  <button className="brand workspace-brand" onClick={()=>setData(null)} title="返回首页"><span className="brand-mark">F</span><span>激光点云林木分析系统<small>FOREST POINT CLOUD ANALYTICS</small></span></button>
  <div className="workspace-breadcrumb">本地工作区 <span>/</span> 森林点云分析</div>
  <div className="workspace-header-actions"><span className="workspace-local"><i/> 本地安全计算</span><button className="workspace-icon-button" aria-label="切换主题" title="切换明暗主题" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>{theme==="dark"?"☀":"☾"}</button><label className="workspace-import">＋ 导入点云<input type="file" accept=".las,.laz" onChange={handleFile}/></label></div>
 </header>
 <div className="workspace-body">
  <nav className="workspace-sidebar" aria-label="分析模块">
   <div className="workspace-nav-heading">分析工作空间 <small>ANALYSIS WORKSPACE</small></div>
   <div className="workspace-nav-items">{WORKSPACE_MODULES.map(([key,icon,title,desc])=><button key={key} title={title} className={"workspace-nav-item"+(tab===key?" active":"")} aria-current={tab===key?"page":undefined} onClick={()=>setTab(key)}><span className="workspace-nav-icon">{icon}</span><span><b>{title}</b><small>{desc}</small></span>{tab===key&&<i/>}</button>)}</div>
   <div className="workspace-dataset"><small>当前数据集</small><strong title={fileName}>{fileName||"LAS 点云"}</strong><span>{data.nOrig.toLocaleString()} 个原始点</span><div><i/> {zN?"高度归一化已完成":"正在准备数据"}</div></div>
  </nav>
  <main className="workspace-main">
   <div className="workspace-page-heading"><div><small>FOREST INTELLIGENCE</small><h1>点云分析工作台</h1><p title={fileName}>{fileName} <span>·</span> {clp?"样地裁剪数据":"完整点云数据"}</p></div><button className="workspace-outline" onClick={hImg}>↗ 导出当前视图</button></div>
   <div className="workspace-overview">
    <div><span>当前分析点数</span><strong>{aP.x.length.toLocaleString()}<small>pts</small></strong></div>
    <div><span>研究范围</span><strong>{((aB.x1-aB.x0)*(aB.y1-aB.y0)).toLocaleString(undefined,{maximumFractionDigits:0})}<small>m²</small></strong></div>
    <div><span>归一化高度</span><strong>{normRange}</strong></div>
    <div><span>识别单木</span><strong>{segs?(met?met.length:segs.count).toLocaleString():"—"}<small>{segs?"棵":"等待分割"}</small></strong></div>
   </div>
   {msg&&<div className="workspace-message" role="status">{msg}</div>}
   <section className="workspace-viewer" aria-label="点云可视化">
    <div className="workspace-viewer-toolbar"><div className="workspace-viewer-title"><i/> 点云视图 <small>{view==="2d"?"二维联合视图":"三维交互视图"}</small></div><div className="workspace-viewer-controls"><div className="workspace-view-switch">{["2d","3d"].map(v=><button key={v} className={view===v?"selected":""} aria-pressed={view===v} onClick={()=>setView(v)}>{v.toUpperCase()}</button>)}</div><label className="workspace-color-select"><span>着色</span><select value={cMode} onChange={e=>setCMode(e.target.value)}><option value="height">原始高度</option><option value="normalized">归一化高度</option>{aP.hasRGB&&<option value="rgb">RGB 真彩色</option>}<option value="intensity">回波强度</option><option value="classification">点云分类</option>{segs&&<option value="segment">单木分割</option>}</select></label>{clp&&<button className="workspace-outline" onClick={hReset}>↩ 重置裁剪</button>}</div></div>
    <div className="workspace-canvas-stack">
     <div className={"workspace-canvas-layout "+(view==="2d"?"is-2d":"is-3d")}>
      {view==="2d"?(<><div className="workspace-plan-view"><span className="workspace-view-label">俯视图 <small>XY</small></span><canvas ref={topR} style={{cursor:tMode?"crosshair":"grab"}} onMouseDown={e=>handleMouse(e,"down")} onMouseMove={e=>handleMouse(e,"move")} onMouseUp={e=>handleMouse(e,"up")} onMouseLeave={e=>{dragR.current.on=false;dragR.current.moved=false;}} onWheel={e=>handleMouse(e,"wheel")}/><div className="workspace-canvas-hint">{tMode?"样线模式：点击两个点绘制剖面":!clp&&zN?"点击设置裁剪中心 · 拖动平移 · 滚轮缩放":"拖动平移 · 滚轮缩放"}</div></div><div className="workspace-elevation-view"><span className="workspace-view-label">侧视图 <small>XZ</small></span><canvas ref={sideR}/></div></>):<div ref={threeR} className="workspace-three-view"/>}
     </div>
     {view==="2d"&&<div className="workspace-transect" style={{height:hasTrans?180:0}}><canvas ref={transR} onMouseDown={e=>e.stopPropagation()} onMouseMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}/></div>}
    </div>
    <div className="workspace-viewer-footer"><span><i/> {view==="2d"?"平面与高程同步展示":"拖动旋转 · 滚轮缩放"}</span><span>{cMode==="segment"?"单木分割着色":cMode==="classification"?"ASPRS 分类":cMode==="normalized"?"相对地面高度":cMode==="intensity"?"激光回波强度":cMode==="rgb"?"RGB 真彩色":"原始高程着色"}</span></div>
   </section>
  </main>
  <aside className="workspace-inspector" aria-label="分析参数"><div className="workspace-inspector-heading"><small>PARAMETERS & RESULTS</small><h2>{WORKSPACE_MODULES.find(m=>m[0]===tab)?.[2]}</h2><p>{WORKSPACE_MODULES.find(m=>m[0]===tab)?.[3]}</p></div><div className="workspace-panel-content">

{tab==="tools"&&(<><Sc t="显示">
<Rw l="大小"><input type="range" min={.5} max={5} step={.25} value={ptSz} onChange={e=>setPtSz(+e.target.value)} style={{flex:1}}/><span style={{fontSize:11,color:txM,width:20}}>{ptSz}</span></Rw>
<Rw l="采样"><input type="range" min={10} max={100} step={5} value={ptPct} onChange={e=>setPtPct(+e.target.value)} style={{flex:1}}/><span style={{fontSize:11,color:txM,width:28}}>{ptPct}%</span></Rw></Sc>
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

{tab==="metrics"&&(<Sc t="单木指标">{!met?<div style={{fontSize:12,color:txD}}>请先运行分割</div>:(
<div style={{overflowX:"auto"}}><button style={{...BT(true),marginBottom:6,fontSize:11}} onClick={hCSV}>📥 CSV</button>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}><thead><tr>{["#","H","CD","X","Y","DBH₁","DBH₂","H₂","CD₂","N"].map(h=><th key={h} style={{textAlign:"left",padding:"2px",borderBottom:`1px solid ${bd}`,color:txD,fontWeight:500}}>{h}</th>)}</tr></thead>
<tbody>{met.slice(0,200).map((m,i)=>(<tr key={m.id} style={{background:sel===m.id?ac+"15":i%2===0?"transparent":bd+"22",cursor:"pointer"}} onClick={()=>{setSel(sel===m.id?null:m.id);setCMode("segment");}}>
<td style={{padding:"2px",color:CL[(m.id-1)%CL.length],fontWeight:700}}>{m.id}</td><td style={{padding:"2px"}}>{m.h.toFixed(1)}</td><td style={{padding:"2px"}}>{m.cd.toFixed(1)}</td>
<td style={{padding:"2px",fontSize:9}}>{m.cx.toFixed(1)}</td><td style={{padding:"2px",fontSize:9}}>{m.cy.toFixed(1)}</td><td style={{padding:"2px",color:gn2}}>{m.dbhModel?.toFixed(1)||"–"}</td>
<td style={{padding:"1px"}}><input value={m.dbhManual} onChange={e=>uMet(m.id,"dbhManual",e.target.value)} style={{...IN,width:26,padding:"1px 2px"}}/></td>
<td style={{padding:"1px"}}><input value={m.hManual} onChange={e=>uMet(m.id,"hManual",e.target.value)} style={{...IN,width:26,padding:"1px 2px"}}/></td>
<td style={{padding:"1px"}}><input value={m.cdManual} onChange={e=>uMet(m.id,"cdManual",e.target.value)} style={{...IN,width:26,padding:"1px 2px"}}/></td>
<td style={{padding:"2px"}}>{m.cnt}</td></tr>))}</tbody></table></div>)}</Sc>)}

{tab==="area"&&(<Sc t="区域统计">
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
</div>)}</Sc>)}

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
{SP.find(s=>s.id===sp)?.experimental&&<div style={{fontSize:11,color:og,marginBottom:6,padding:"4px 6px",background:dk,borderRadius:3,borderLeft:`2px solid ${og}`,fontWeight:600}}>⚠ "BETA：该树种的土耳其校准系数尚未验证，结果仅供参考。"</div>}
{sp.startsWith("pb")&&<div style={{fontSize:11,color:gn2,marginBottom:6,padding:"4px 6px",background:dk,borderRadius:3,borderLeft:`2px solid ${gn2}`}}>🌲 "生物量：Sönmez et al. 2016"</div>}
<button style={{...BT(true),width:"100%"}} onClick={hSp} disabled={!met}>应用模型</button></Sc>)}

{tab==="transect"&&(<Sc t="垂直剖面"><div style={{fontSize:11,color:txD,marginBottom:6}}>在 2D 视图中点击 2 个点</div>
<button style={{...BT(!tMode),width:"100%",marginBottom:4}} onClick={()=>{setTMode(true);setTP1(null);setTP2(null);setTData(null);}}>✏ 绘制样线</button>
{tP1&&!tP2&&<div style={{fontSize:11,color:og}}>P1 ✓</div>}
{tData&&<div style={{fontSize:11,color:gn2}}>{tData.length} pts</div>}
<button style={{...BT(false),width:"100%",marginTop:4}} onClick={()=>{setTP1(null);setTP2(null);setTData(null);}}>🗑 清除</button>
<div style={{fontSize:10,color:txM,marginTop:8,padding:6,background:ac+"11",border:`1px solid ${ac}33`,borderRadius:4,lineHeight:1.4}}>ℹ 在 2D 视图中沿一条线选取 2 个点；下方将绘制垂直冠层剖面（含 1.3 m 参考线）。</div></Sc>)}
</div></aside></div><footer className="workspace-statusbar"><span><i/> 所有数据均在当前设备处理</span><span>LAS · {fileName}</span><span>FORA {FORA_VERSION}</span></footer></div>);}
function Sc({t,children}){return <section className="workspace-control-card"><h3>{t}</h3>{children}</section>;}
function Rw({l,children}){return <div className="workspace-control-row"><span>{l}</span>{children}</div>;}
