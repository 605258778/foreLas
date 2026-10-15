// --- core ---
function gB(p){let x0=1/0,x1=-1/0,y0=1/0,y1=-1/0,z0=1/0,z1=-1/0;for(let i=0;i<p.x.length;i++){if(p.x[i]<x0)x0=p.x[i];if(p.x[i]>x1)x1=p.x[i];if(p.y[i]<y0)y0=p.y[i];if(p.y[i]>y1)y1=p.y[i];if(p.z[i]<z0)z0=p.z[i];if(p.z[i]>z1)z1=p.z[i];}return{x0,x1,y0,y1,z0,z1};}
function makeNorm(pts,cs=2,progress=()=>{}){const b=gB(pts),cols=Math.ceil((b.x1-b.x0)/cs)+1,rows=Math.ceil((b.y1-b.y0)/cs)+1;const gnd=new Float32Array(rows*cols).fill(1/0);
for(let i=0;i<pts.x.length;i++){if(i%65536===0)progress(i/pts.x.length*35,"估计地面格网");const c=Math.floor((pts.x[i]-b.x0)/cs),r=Math.floor((pts.y[i]-b.y0)/cs);if(pts.z[i]<gnd[r*cols+c])gnd[r*cols+c]=pts.z[i];}
for(let p=0;p<3;p++)for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(c===0)progress(35+(p*rows+r)/(3*rows)*25,"填补地面格网");if(gnd[r*cols+c]<1/0)continue;let s=0,n=0;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&gnd[nr*cols+nc]<1/0){s+=gnd[nr*cols+nc];n++;}}if(n)gnd[r*cols+c]=s/n;}
const z=new Float32Array(pts.x.length);for(let i=0;i<pts.x.length;i++){if(i%65536===0)progress(60+i/pts.x.length*40,"计算归一化高度");const c=Math.floor((pts.x[i]-b.x0)/cs),r=Math.floor((pts.y[i]-b.y0)/cs),v=gnd[r*cols+c];z[i]=v<1/0?pts.z[i]-v:pts.z[i]-b.z0;}return z;}
function clipP(pts,za,cx,cy,rad,sh,progress=()=>{}){const idx=[];for(let i=0;i<pts.x.length;i++){if(i%65536===0)progress(i/pts.x.length*50,"筛选样地点云");const dx=pts.x[i]-cx,dy=pts.y[i]-cy;if(sh==="circle"?dx*dx+dy*dy<=rad*rad:Math.abs(dx)<=rad&&Math.abs(dy)<=rad)idx.push(i);}
const o={x:new Float32Array(idx.length),y:new Float32Array(idx.length),z:new Float32Array(idx.length),r:new Uint8Array(idx.length),g:new Uint8Array(idx.length),b:new Uint8Array(idx.length),intensity:new Uint16Array(idx.length),classification:new Uint8Array(idx.length),hasRGB:pts.hasRGB,ox:pts.ox||0,oy:pts.oy||0};const zo=new Float32Array(idx.length);
idx.forEach((j,i)=>{if(i%65536===0)progress(50+i/idx.length*50,"整理裁剪结果");o.x[i]=pts.x[j];o.y[i]=pts.y[j];o.z[i]=pts.z[j];o.r[i]=pts.r[j];o.g[i]=pts.g[j];o.b[i]=pts.b[j];o.intensity[i]=pts.intensity[j];o.classification[i]=pts.classification[j];zo[i]=za[j];});return{pts:o,zN:zo};}
function runSeg(pts,za,cell,minH,sr,vwsMode,vwsPreset,customCoef,progress=()=>{}){if(!pts.x.length)return{labels:new Int32Array(0),count:0};const b=gB(pts),cols=Math.ceil((b.x1-b.x0)/cell)+1,rows=Math.ceil((b.y1-b.y0)/cell)+1;const chm=new Float32Array(rows*cols).fill(-1);progress(0,"构建冠层高度模型");
for(let i=0;i<pts.x.length;i++){if(i%65536===0)progress(i/pts.x.length*20,"构建冠层高度模型");const c=Math.floor((pts.x[i]-b.x0)/cell),r=Math.floor((pts.y[i]-b.y0)/cell);if(za[i]>chm[r*cols+c])chm[r*cols+c]=za[i];}
const sm=new Float32Array(rows*cols);for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(c===0)progress(20+r/rows*15,"平滑冠层格网");let s=0,n=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&chm[nr*cols+nc]>=0){s+=chm[nr*cols+nc];n++;}}sm[r*cols+c]=n?s/n:-1;}
const coef=vwsMode?(vwsPreset==="custom"&&customCoef?customCoef:(VWS[vwsPreset]||VWS.pine)):null;const sc=Math.ceil(sr/cell),seeds=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(c===0)progress(35+r/rows*20,"搜索树顶种子");const h=sm[r*cols+c];if(h<minH)continue;
const r2=coef?vwsRadiusPx(h,cell,coef):sc;let mx=true;for(let dr=-r2;dr<=r2&&mx;dr++)for(let dc=-r2;dc<=r2&&mx;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&sm[nr*cols+nc]>h)mx=false;}if(mx)seeds.push({r,c,h});}
if(!seeds.length)return{labels:new Int32Array(pts.x.length),count:0};const cl2=new Int32Array(rows*cols);seeds.forEach((s,i)=>{cl2[s.r*cols+s.c]=i+1;});
const ord=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(sm[r*cols+c]>=minH)ord.push({r,c,h:sm[r*cols+c]});ord.sort((a,b2)=>b2.h-a.h);
for(let p=0;p<8;p++){progress(55+p/8*30,"生长单木区域");let ch=false;for(const{r,c}of ord){const k=r*cols+c;if(cl2[k])continue;let best=0,bh=-1;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols){const nk=nr*cols+nc;if(cl2[nk]&&sm[nk]>bh){bh=sm[nk];best=cl2[nk];}}}if(best){cl2[k]=best;ch=true;}}if(!ch)break;}
const labels=new Int32Array(pts.x.length);for(let i=0;i<pts.x.length;i++){if(i%65536===0)progress(85+i/pts.x.length*10,"分配点云标签");if(za[i]<minH)continue;const c=Math.floor((pts.x[i]-b.x0)/cell),r=Math.floor((pts.y[i]-b.y0)/cell);labels[i]=cl2[r*cols+c];}
progress(95,"整理分割编号");const u=new Set(labels);u.delete(0);const rm=new Map();let seq=1;for(const v of u)rm.set(v,seq++);for(let i=0;i<labels.length;i++)labels[i]=rm.get(labels[i])||0;return{labels,count:seq-1};}
function makeMet(pts,za,labels,cnt,crownMode,progress=()=>{}){if(!cnt)return[];const trees=[];for(let t=1;t<=Math.min(cnt,5000);t++){progress((t-1)/Math.min(cnt,5000)*100,`提取单木指标  ${t}/${Math.min(cnt,5000)}`);let x0=1/0,x1=-1/0,y0=1/0,y1=-1/0,hM=0,c=0;const tpts=[];
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
function makeArea(pts,za,mets,roi,progress=()=>{}){if(!pts||!za)return"E1";if(pts.x.length<10)return"E2";if(za.length!==pts.x.length)return"E3";
progress(0,"筛选植被高度");const h=[];for(let i=0;i<za.length;i++)if(za[i]>0.5&&isFinite(za[i]))h.push(za[i]);if(h.length<5)return"E4:"+h.length;
progress(35,"计算高度分位数");h.sort((a,b2)=>a-b2);const n=h.length,p=v=>h[Math.min(n-1,Math.floor(n*v/100))],mn=h.reduce((s,v)=>s+v,0)/n;
const va=n>1?h.reduce((s,v)=>s+(v-mn)**2,0)/(n-1):0,sd=Math.sqrt(va),cv=mn>0?sd/mn*100:0;
const m4=h.reduce((s,v)=>s+(v-mn)**4,0)/n,ku=va>0?m4/va**2-3:0;
const m3=h.reduce((s,v)=>s+(v-mn)**3,0)/n,sk=va>0?m3/va**1.5:0;
progress(65,"计算冠层覆盖与密度");const dr=t=>{let a=0;for(let i=0;i<za.length;i++)if(za[i]>t&&isFinite(za[i]))a++;return za.length>0?a/za.length:0;};
// use the real ROI area for density (circle -> pi*r^2), else the bounding box
const bb=gB(pts);let area;let areaSrc;
if(roi&&roi.shape==="circle"&&roi.r>0){area=Math.PI*roi.r*roi.r;areaSrc="circle";}
else if(roi&&roi.shape==="rect"&&roi.r>0){area=(2*roi.r)*(2*roi.r);areaSrc="rect";}
else{area=Math.max((bb.x1-bb.x0)*(bb.y1-bb.y0),1);areaSrc="bbox";}
area=Math.max(area,1);const iN=mets?mets.length:0;
return{n_pts:pts.x.length,n_veg:n,area,area_source:areaSrc,h5:p(5),h10:p(10),h25:p(25),h50:p(50),h75:p(75),h90:p(90),h95:p(95),h99:p(99),h_mean:mn,h_max:h[n-1],h_sd:sd,cv_h:cv,skewness:sk,kurtosis:ku,iqr:p(75)-p(25),variance:va,
d1:dr(p(10)),d3:dr(p(30)),d5:dr(p(50)),d7:dr(p(70)),d9:dr(p(90)),cc13:dr(1.3),itc_n:iN,itc_max:iN>0?Math.max(...mets.map(m=>m.h)):0,itc_min:iN>0?Math.min(...mets.map(m=>m.h)):0,itc_mean:iN>0?mets.reduce((s,m)=>s+m.h,0)/iN:0,density:iN>0?iN/area*10000:0};}
function exTr(pts,za,p1,p2,w=2,progress=()=>{}){const dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.sqrt(dx*dx+dy*dy);if(len<.1)return[];const nx=-dy/len,ny=dx/len,res=[];
for(let i=0;i<pts.x.length;i++){if(i%65536===0)progress(i/pts.x.length*85,"提取样线剖面");const px=pts.x[i]-p1.x,py=pts.y[i]-p1.y;const al=(px*dx+py*dy)/len,pe=Math.abs(px*nx+py*ny);if(al>=0&&al<=len&&pe<=w/2)res.push({dist:al,zN:za[i]});}progress(90,"整理剖面距离");res.sort((a,b2)=>a.dist-b2.dist);return res;}

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
function normWithDTM(pts,dtm,progress=()=>{}){const N=pts.x.length,out=new Float32Array(N),ox=pts.ox||0,oy=pts.oy||0;for(let i=0;i<N;i++){if(i%65536===0)progress(i/N*100,"外部地面模型高度插值");const ax=ox+pts.x[i],ay=oy+pts.y[i];const px=(ax-dtm.oX)/dtm.px,py=(dtm.oY-ay)/dtm.py,x0=Math.floor(px),y0=Math.floor(py),x1=x0+1,y1=y0+1;
// Edge fallback: nearest cell within bounds
if(x0<0||y0<0||x1>=dtm.w||y1>=dtm.h){const xn=Math.max(0,Math.min(dtm.w-1,Math.round(px))),yn=Math.max(0,Math.min(dtm.h-1,Math.round(py)));const v=dtm.data[yn*dtm.w+xn];out[i]=isFinite(v)?pts.z[i]-v:NaN;continue;}
const dx=px-x0,dy=py-y0,w=dtm.w,v00=dtm.data[y0*w+x0],v10=dtm.data[y0*w+x1],v01=dtm.data[y1*w+x0],v11=dtm.data[y1*w+x1];
if(!isFinite(v00)||!isFinite(v10)||!isFinite(v01)||!isFinite(v11)){const c=[v00,v10,v01,v11].filter(isFinite);out[i]=c.length?pts.z[i]-c.reduce((a,b)=>a+b)/c.length:NaN;}
else{const a=v00*(1-dx)+v10*dx,b=v01*(1-dx)+v11*dx,g=a*(1-dy)+b*dy;out[i]=pts.z[i]-g;}}return out;}


export { gB, makeNorm, clipP, runSeg, makeMet, makeArea, exTr, customVWS, parseGeoTIFF, parseAsciiDTM, parseXYZdtm, normWithDTM };
