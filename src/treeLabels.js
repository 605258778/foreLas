// Labels use the same local coordinate origin as the displayed point cloud.
export function getTreeTops(points, labels) {
  const tops=new Map();
  if(!points||!labels)return tops;
  for(let i=0;i<labels.length;i++) {
    const id=labels[i],z=points.z[i];
    if(id>0&&Number.isFinite(z)&&(!tops.has(id)||z>tops.get(id)))tops.set(id,z);
  }
  return tops;
}

export function getTreeMarkers(metrics, points, tops) {
  if(!points)return [];
  return (metrics||[]).map(m=>({id:m.id,x:m.cxRel??m.cx-(points.ox||0),y:m.cyRel??m.cy-(points.oy||0),z:tops.get(m.id)}))
    .filter(m=>Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.z));
}

export function projectTreeMarkers(markers, transform, isTop=true) {
  const {oX,oY,sc,xMn,yMn}=transform;
  return markers.map(m=>({id:m.id,x:oX+(m.x-xMn)*sc,y:oY-((isTop?m.y:m.z)-yMn)*sc}));
}

export function hitTreeLabel(labels, x, y) {
  // The selected label is drawn last and takes priority when labels overlap.
  for(let i=(labels?.length||0)-1;i>=0;i--) {
    const label=labels[i];
    if(x>=label.left&&x<=label.right&&y>=label.top&&y<=label.bottom)return label.id;
  }
  return null;
}

function pill(ctx,x,y,w,h,r) {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

export function drawTreeLabels(ctx, markers, {width,height,scale=1,theme='dark',selected=null,colors}) {
  const regions=[],grid=new Map(),cell=64*scale,pad=3*scale;
  const ordered=selected===null?markers:[...markers.filter(m=>m.id!==selected),...markers.filter(m=>m.id===selected)];
  const cells=box=>{
    const result=[];
    for(let x=Math.floor(box.left/cell);x<=Math.floor(box.right/cell);x++)for(let y=Math.floor(box.top/cell);y<=Math.floor(box.bottom/cell);y++)result.push(`${x}:${y}`);
    return result;
  };
  const intersects=(a,b)=>a.left<b.right+pad&&a.right+pad>b.left&&a.top<b.bottom+pad&&a.bottom+pad>b.top;
  ctx.save();ctx.font=`600 ${12*scale}px "Segoe UI", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  for(const marker of ordered) {
    const {id,x,y}=marker;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>width||y<0||y>height)continue;
    const text=`#${id}`,w=Math.max(30*scale,ctx.measureText(text).width+14*scale),h=22*scale;
    const active=id===selected,color=colors[(id-1)%colors.length];
    let box;
    for(const [dx,dy] of [[0,-18*scale],[0,-44*scale],[w+5*scale,-18*scale],[-w-5*scale,-18*scale],[0,18*scale]]) {
      const left=Math.max(pad,Math.min(width-w-pad,x-w/2+dx));
      const top=Math.max(pad,Math.min(height-h-pad,y-h+dy));
      const candidate={id,left,right:left+w,top,bottom:top+h,anchorX:x,anchorY:y};
      if(!box)box=candidate;
      if(!cells(candidate).some(key=>(grid.get(key)||[]).some(other=>intersects(candidate,other)))){box=candidate;break;}
    }
    for(const key of cells(box)){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(box);}
    ctx.globalAlpha=selected!==null&&!active ? 0.48 : 1;
    ctx.strokeStyle=color;ctx.lineWidth=(active?2:1)*scale;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo((box.left+box.right)/2,box.bottom);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,(active?4:2.5)*scale,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    pill(ctx,box.left,box.top,w,h,6*scale);
    ctx.fillStyle=active?(theme==='dark'?'#d8ffe8':'#164c32'):(theme==='dark'?'#061c16ee':'#ffffffee');ctx.fill();ctx.stroke();
    ctx.fillStyle=active?(theme==='dark'?'#073521':'#ffffff'):(theme==='dark'?'#effff5':'#123524');
    ctx.fillText(text,(box.left+box.right)/2,(box.top+box.bottom)/2);
    regions.push(box);
  }
  ctx.restore();return regions;
}
