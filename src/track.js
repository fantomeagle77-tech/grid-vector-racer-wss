export function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
export function hashSeed(input){const s=String(input);let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}

const DIRS=[
  {x:0,y:-1},{x:1,y:-1},{x:1,y:0},{x:1,y:1},
  {x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1}
];
const MIRROR_HEADING=[0,7,6,5,4,3,2,1];
const FAMILIES={
  beginnerA:{tier:1,cmd:[[0,14,22],[1,4,7],[0,10,16],[7,4,7],[0,12,19],[1,4,7],[0,10,17],[7,4,7],[0,10,15]]},
  beginnerB:{tier:1,cmd:[[0,13,18],[7,4,6],[0,8,13],[1,4,6],[0,10,15],[1,4,6],[0,8,12],[7,4,6],[0,12,18],[7,4,6],[0,9,14]]},
  flowingA:{tier:2,cmd:[[0,14,20],[1,5,7],[2,8,14],[1,4,6],[0,11,18],[7,5,7],[6,9,15],[7,4,6],[0,14,22],[1,5,7],[2,8,14],[1,4,6],[0,14,22]]},
  flowingB:{tier:2,cmd:[[0,12,18],[7,5,7],[6,8,13],[7,4,6],[0,10,16],[1,5,7],[2,10,16],[1,4,6],[0,12,19],[7,4,7],[0,8,13],[1,4,6],[0,12,19]]},
  flowingC:{tier:2,cmd:[[0,11,16],[1,4,6],[0,7,11],[7,4,6],[0,8,13],[7,5,7],[6,8,12],[7,4,6],[0,12,18],[1,5,7],[2,9,14],[1,4,6],[0,14,20]]},
  technicalA:{tier:3,cmd:[[0,10,15],[1,4,6],[2,12,19],[3,4,6],[4,7,11],[3,4,6],[2,8,13],[1,4,6],[0,24,38],[7,4,6],[6,12,20],[7,4,6],[0,20,30]]},
  technicalB:{tier:3,cmd:[[0,11,16],[7,4,6],[6,13,20],[5,4,6],[4,6,10],[5,4,6],[6,9,14],[7,4,6],[0,18,28],[1,4,6],[2,14,22],[1,4,6],[0,21,31]]},
  technicalC:{tier:3,cmd:[[0,12,17],[1,5,7],[2,9,15],[1,4,6],[0,8,13],[7,4,7],[6,17,25],[7,5,7],[0,10,16],[1,5,7],[2,8,14],[1,4,6],[0,16,24]]},
  technicalD:{tier:3,cmd:[[0,10,15],[7,4,6],[0,7,11],[1,4,6],[2,10,16],[3,4,6],[4,6,9],[3,4,6],[2,10,15],[1,4,6],[0,16,23],[7,5,7],[6,14,21],[7,4,6],[0,18,28]]},
  extremeA:{tier:4,cmd:[[0,8,12],[1,4,6],[2,13,19],[3,4,6],[4,8,13],[3,4,6],[2,8,13],[1,4,6],[0,36,50],[7,4,6],[6,17,25],[5,4,6],[4,8,13],[5,4,6],[6,24,34],[7,4,6],[0,32,44]]},
  extremeB:{tier:4,cmd:[[0,8,12],[7,4,6],[6,13,19],[5,4,6],[4,7,11],[5,4,6],[6,8,13],[7,4,6],[0,30,42],[1,4,6],[2,17,25],[3,4,6],[4,7,11],[3,4,6],[2,22,31],[1,4,6],[0,34,46]]},
  extremeC:{tier:4,cmd:[[0,8,12],[1,4,6],[2,15,21],[3,4,6],[4,11,15],[3,4,6],[2,10,16],[1,4,6],[0,24,34],[7,4,6],[6,18,26],[5,4,6],[4,11,15],[5,4,6],[6,16,24],[7,4,6],[0,26,38]]},
  extremeD:{tier:4,cmd:[[0,8,12],[7,4,6],[6,15,21],[5,4,6],[4,10,14],[5,4,6],[6,10,16],[7,4,6],[0,23,33],[1,4,6],[2,18,26],[3,4,6],[4,10,14],[3,4,6],[2,16,24],[1,4,6],[0,27,39]]}
};
const wrap=n=>(n%8+8)%8;
function headingDelta(a,b){let d=wrap(b)-wrap(a);if(d>4)d-=8;if(d<-4)d+=8;return d}
function segIntersectT(a,b,c,d){
  const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},den=r.x*s.y-r.y*s.x;if(Math.abs(den)<1e-9)return null;
  const q={x:c.x-a.x,y:c.y-a.y},t=(q.x*s.y-q.y*s.x)/den,u=(q.x*r.y-q.y*r.x)/den;
  return t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9?clamp(t,0,1):null;
}
function pointSegDist2(p,a,b){const vx=b.x-a.x,vy=b.y-a.y,L2=vx*vx+vy*vy;if(L2<1e-12)return(p.x-a.x)**2+(p.y-a.y)**2;const t=clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/L2,0,1),x=a.x+vx*t,y=a.y+vy*t;return(p.x-x)**2+(p.y-y)**2}
function pointInPoly(x,y,poly,eps=.045){
  const p={x,y};for(let i=0,j=poly.length-1;i<poly.length;j=i++){if(pointSegDist2(p,poly[j],poly[i])<=eps*eps)return true}
  let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/(b.y-a.y+1e-12)+a.x);if(hit)inside=!inside}return inside;
}
function polyBBox(poly){let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of poly){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}return{minX,maxX,minY,maxY}}

export function parseTrackCode(code){
  const m=String(code||'').trim().toUpperCase().match(/^GV-(10|[1-9])-([CA])-([0-9A-Z]+)$/);if(!m)return null;
  const seed=parseInt(m[3],36);if(!Number.isFinite(seed))return null;
  return{difficulty:+m[1],ruleset:m[2]==='A'?'arcade':'classic',seed:'#'+seed.toString(36)};
}

export function encodeCustomTrackCode(data){
  const payload=JSON.stringify(data);let bin='';if(typeof TextEncoder!=='undefined'){for(const b of new TextEncoder().encode(payload))bin+=String.fromCharCode(b)}else bin=unescape(encodeURIComponent(payload));
  const b64=(typeof btoa==='function'?btoa(bin):Buffer.from(bin,'binary').toString('base64')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return'GVC1-'+b64;
}
export function decodeCustomTrackCode(code){try{let s=String(code||'').trim();if(!s.startsWith('GVC1-'))return null;s=s.slice(5).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=typeof atob==='function'?atob(s):Buffer.from(s,'base64').toString('binary');let json;if(typeof TextDecoder!=='undefined'){const a=Uint8Array.from(bin,c=>c.charCodeAt(0));json=new TextDecoder().decode(a)}else json=decodeURIComponent(escape(bin));const d=JSON.parse(json);return d?.customVersion?d:null}catch{return null}}

export class Track{
  constructor(seed=1,difficulty=4,withItems=false){
    const custom=seed&&typeof seed==='object'&&seed.customVersion;
    if(custom){this.customData=JSON.parse(JSON.stringify(seed));this.seed=hashSeed(seed.id||seed.name||JSON.stringify([seed.path||[],seed.branches||[]]));this.sourceSeed=seed.id||'custom';this.difficulty=clamp(+seed.difficulty||+difficulty||4,1,10);this.withItems=!!withItems;this.w=clamp(+seed.w||160,80,320);this.h=clamp(+seed.h||220,100,420);this.rng=mulberry32(this.seed);this.path=[];this.customBranches=[];this.items=new Map();this.decor=[];this.segmentCache=new Map();this.nodeInfoCache=new Map();this.binSize=8;this.bins=new Map();this.roadPieces=[];this.roadPieceBins=new Map();this.roadBinSize=6;this.edgeSegments=[];this.loadCustom(seed);return}
    const raw=String(seed);this.seed=raw.startsWith('#')?parseInt(raw.slice(1),36)>>>0:hashSeed(seed);this.sourceSeed=seed;
    this.difficulty=clamp(+difficulty||1,1,10);this.withItems=!!withItems;this.w=112;this.h=120;this.rng=mulberry32(this.seed);this.path=[];this.customBranches=[];this.items=new Map();this.decor=[];this.segmentCache=new Map();this.nodeInfoCache=new Map();this.binSize=8;this.bins=new Map();this.roadPieces=[];this.roadPieceBins=new Map();this.roadBinSize=6;this.edgeSegments=[];this.generate();
  }

  code(ruleset=this.withItems?'arcade':'classic'){return this.customData?`CUSTOM-${String(this.customData.id||this.seed.toString(36)).toUpperCase()}`:`GV-${this.difficulty}-${ruleset==='arcade'?'A':'C'}-${this.seed.toString(36).toUpperCase()}`}
  prepareRoute(route){
    if(!route?.length)return route;
    for(let i=0;i<route.length-1;i++){const a=route[i],b=route[i+1],dx=Math.sign(b.x-a.x),dy=Math.sign(b.y-a.y);a.heading=DIRS.findIndex(d=>d.x===dx&&d.y===dy);if(a.heading<0)a.heading=0}
    route[route.length-1].heading=route[route.length-2]?.heading??0;
    for(let i=0;i<route.length;i++){const p=route[i],prev=route[Math.max(0,i-1)],next=route[Math.min(route.length-1,i+1)],tx=next.x-prev.x,ty=next.y-prev.y,L=Math.hypot(tx,ty)||1;p.tangent={x:tx/L,y:ty/L};p.normal={x:-p.tangent.y,y:p.tangent.x};p.width=(p.leftWidth+p.rightWidth)/2}
    return route;
  }
  loadCustom(data){
    const point=p=>({x:Math.round(+p.x),y:Math.round(+p.y),leftWidth:clamp(+p.leftWidth||(+p.width||7)/2,1.45,7),rightWidth:clamp(+p.rightWidth||(+p.width||7)/2,1.45,7)});
    const src=(data.path||[]).map(point);
    if(src.length<2){src.push({x:Math.round(this.w/2),y:this.h-12,leftWidth:4,rightWidth:4},{x:Math.round(this.w/2),y:this.h-13,leftWidth:4,rightWidth:4})}
    this.path=this.prepareRoute(src);this.startIndex=0;this.finishIndex=this.path.length-1;this.start={x:this.path[0].x,y:this.path[0].y};this.finish={x:this.path[this.finishIndex].x,y:this.path[this.finishIndex].y};
    this.customBranches=(Array.isArray(data.branches)?data.branches:[]).map((b,bi)=>{
      const fromIndex=clamp(Math.round(+b.fromIndex||0),0,this.finishIndex),toIndex=clamp(Math.round(+b.toIndex||0),0,this.finishIndex);
      if(toIndex<=fromIndex+2)return null;
      let route=(b.path||[]).map(point);
      const a=this.path[fromIndex],z=this.path[toIndex];
      if(!route.length||route[0].x!==a.x||route[0].y!==a.y)route.unshift(point(a));
      if(route[route.length-1].x!==z.x||route[route.length-1].y!==z.y)route.push(point(z));
      route=this.prepareRoute(route);
      return{id:b.id||`br${bi}`,fromIndex,toIndex,path:route};
    }).filter(Boolean);
    let turns=0,horizontalSteps=0,southSteps=0,minWidth=99,minFullWidth=99,maxFullWidth=0,asymSum=0;for(let i=0;i<this.path.length;i++){const p=this.path[i];minWidth=Math.min(minWidth,p.width);const fw=p.leftWidth+p.rightWidth;minFullWidth=Math.min(minFullWidth,fw);maxFullWidth=Math.max(maxFullWidth,fw);asymSum+=Math.abs(p.leftWidth-p.rightWidth);if(i&&this.path[i-1].heading!==p.heading)turns++;if(p.heading===2||p.heading===6)horizontalSteps++;if(p.heading>=3&&p.heading<=5)southSteps++}
    const xs=this.path.map(p=>p.x),ys=this.path.map(p=>p.y);this.features={turns,horizontalSteps,southSteps,minWidth,minFullWidth,maxFullWidth,widthRange:maxFullWidth-minFullWidth,asymmetry:asymSum/this.path.length,maxCommandTurn:1,spanX:Math.max(...xs)-Math.min(...xs),spanY:Math.max(...ys)-Math.min(...ys),routeSteps:this.finishIndex,template:'custom',branches:this.customBranches.length};
    this.buildBins();this.buildRoadGeometry();this.name=String(data.name||'Моя трасса').slice(0,32);this.startLine=this.makeGateAt(this.startIndex);this.finishLine=this.makeGateAt(this.finishIndex);
    this.decor=Array.isArray(data.decor)?data.decor.map((d,i)=>({...d,id:i,scale:clamp(+d.scale||1.4,.5,3)})):[];if(!this.decor.length&&data.autoDecor!==false)this.generateDecor();
    if(this.withItems&&Array.isArray(data.items))for(const it of data.items){const x=Math.round(+it.x),y=Math.round(+it.y);if(this.isRoad(x,y))this.items.set(`${x},${y}`,{type:it.type})}
    this.customTraffic=Array.isArray(data.traffic)?data.traffic.map((t,i)=>({...t,id:`ct${i}`,pathIndex:clamp(Math.round(+t.pathIndex||8),2,this.finishIndex-2)})):[];
  }
  familyName(){
    const pick=a=>a[this.seed%a.length];
    if(this.difficulty<=1)return pick(['beginnerA','beginnerB']);
    if(this.difficulty<=3)return pick(['beginnerB','flowingA','flowingB','flowingC']);
    if(this.difficulty<=6)return pick(['flowingA','flowingB','flowingC','technicalC','technicalD']);
    if(this.difficulty<=8)return pick(['technicalA','technicalB','technicalC','technicalD']);
    return pick(['extremeA','extremeB','extremeC','extremeD']);
  }
  buildCommands(familyName){
    const f=FAMILIES[familyName],mirror=this.rng()<.5,commands=f.cmd.map(([h,min,max],i)=>{
      const span=max-min,len=(i===0||i===f.cmd.length-1)?Math.round((min+max)*.5):min+Math.floor(this.rng()*(span+1));return[mirror?MIRROR_HEADING[h]:h,Math.max(4,len)];
    });
    // Seeded micro-variation: medium+ tracks occasionally stretch one technical leg
    // and shorten another. It changes rhythm without introducing illegal >45° turns.
    if(this.difficulty>=3&&commands.length>8){const a=2+Math.floor(this.rng()*(commands.length-5)),b=2+Math.floor(this.rng()*(commands.length-5));commands[a][1]=Math.max(4,commands[a][1]+Math.floor(this.rng()*5)-1);commands[b][1]=Math.max(4,commands[b][1]-Math.floor(this.rng()*3))}
    return{commands,mirror,family:f};
  }
  fitPathToPaper(){
    let minX=Math.min(...this.path.map(p=>p.x)),maxX=Math.max(...this.path.map(p=>p.x)),minY=Math.min(...this.path.map(p=>p.y)),maxY=Math.max(...this.path.map(p=>p.y));
    const marginX=13,marginY=5,spanX=maxX-minX,spanY=maxY-minY;if(spanX>this.w-marginX*2||spanY>this.h-marginY*2)return false;
    // Keep enough paper on the left/right for speed-8 candidate nodes and camera look-ahead.
    let dx=(this.w/2)-this.path[0].x+(this.rng()-.5)*8,dy=(this.h-8)-this.path[0].y;
    dx=Math.round(clamp(dx,marginX-minX,this.w-marginX-maxX));dy=Math.round(clamp(dy,marginY-minY,this.h-marginY-maxY));
    for(const p of this.path){p.x+=dx;p.y+=dy}return true;
  }
  generate(){
    const familyName=this.familyName(),{commands}=this.buildCommands(familyName);let x=0,y=0;this.path=[{x,y,heading:commands[0][0],width:4}];
    for(const [heading,len] of commands){const d=DIRS[heading];for(let k=0;k<len;k++){x+=d.x;y+=d.y;this.path.push({x,y,heading,width:4})}}
    if(!this.fitPathToPaper()){
      // Family dimensions are designed to fit; this conservative fallback only handles an extreme random stretch.
      const scaleBack=.88;this.path=[{x:0,y:0,heading:commands[0][0],width:4}];x=0;y=0;for(const [heading,len0] of commands){const len=Math.max(4,Math.floor(len0*scaleBack)),d=DIRS[heading];for(let k=0;k<len;k++){x+=d.x;y+=d.y;this.path.push({x,y,heading,width:4})}}this.fitPathToPaper();
    }
    for(let i=0;i<this.path.length-1;i++){const a=this.path[i],b=this.path[i+1];a.heading=DIRS.findIndex(d=>d.x===Math.sign(b.x-a.x)&&d.y===Math.sign(b.y-a.y));if(a.heading<0)a.heading=0}this.path[this.path.length-1].heading=this.path[this.path.length-2]?.heading??0;
    this.startIndex=0;this.finishIndex=Math.max(8,this.path.length-6);this.start={x:this.path[0].x,y:this.path[0].y};this.finish={x:this.path[this.finishIndex].x,y:this.path[this.finishIndex].y};
    this.buildHandDrawnWidths();this.separateNearbyLanes();
    let turns=0,horizontalSteps=0,southSteps=0,minWidth=99,minFullWidth=99,maxFullWidth=0,asymSum=0;
    for(let i=0;i<this.path.length;i++){
      const p=this.path[i],prev=this.path[Math.max(0,i-1)],next=this.path[Math.min(this.path.length-1,i+1)],tx=next.x-prev.x,ty=next.y-prev.y,L=Math.hypot(tx,ty)||1;p.tangent={x:tx/L,y:ty/L};p.normal={x:-p.tangent.y,y:p.tangent.x};p.width=(p.leftWidth+p.rightWidth)/2;
      minWidth=Math.min(minWidth,p.width);const fw=p.leftWidth+p.rightWidth;minFullWidth=Math.min(minFullWidth,fw);maxFullWidth=Math.max(maxFullWidth,fw);asymSum+=Math.abs(p.leftWidth-p.rightWidth);
      if(i&&this.path[i-1].heading!==p.heading)turns++;if(p.heading===2||p.heading===6)horizontalSteps++;if(p.heading>=3&&p.heading<=5)southSteps++;
    }
    let maxCommandTurn=0;for(let i=1;i<commands.length;i++)maxCommandTurn=Math.max(maxCommandTurn,Math.abs(headingDelta(commands[i-1][0],commands[i][0])));
    const xs=this.path.map(p=>p.x),ys=this.path.map(p=>p.y);this.features={turns,horizontalSteps,southSteps,minWidth,minFullWidth,maxFullWidth,widthRange:maxFullWidth-minFullWidth,asymmetry:asymSum/this.path.length,maxCommandTurn,spanX:Math.max(...xs)-Math.min(...xs),spanY:Math.max(...ys)-Math.min(...ys),routeSteps:this.finishIndex,template:familyName};
    this.buildBins();this.buildRoadGeometry();this.name=this.deriveName();this.startLine=this.makeGateAt(this.startIndex);this.finishLine=this.makeGateAt(this.finishIndex);this.generateDecor();if(this.withItems)this.generateItems();
  }

  buildHandDrawnWidths(){
    const d=this.difficulty,n=this.path.length,base=4.62-d*.205,amp=.46+d*.16,minSide=d>=9?1.55:d>=7?1.68:d>=5?1.84:2.18,maxSide=5.72;
    const leftTargets=[],rightTargets=[],step=Math.max(4,Math.round(10.5-d*.55));let i=0,l=base,r=base;
    while(i<n){const jitter=amp*(.42+.58*this.rng()),bias=(this.rng()-.5)*amp*.85;l=clamp(base+bias+(this.rng()-.5)*jitter,minSide,maxSide);r=clamp(base-bias+(this.rng()-.5)*jitter,minSide,maxSide);leftTargets.push({i,v:l});rightTargets.push({i,v:r});i+=Math.max(4,step+Math.floor((this.rng()-.5)*4))}
    if(leftTargets[leftTargets.length-1].i<n-1){leftTargets.push({i:n-1,v:clamp(base+(this.rng()-.5)*amp,minSide,maxSide)});rightTargets.push({i:n-1,v:clamp(base+(this.rng()-.5)*amp,minSide,maxSide)})}
    const interp=(targets,idx)=>{let k=0;while(k<targets.length-2&&idx>targets[k+1].i)k++;const a=targets[k],b=targets[Math.min(k+1,targets.length-1)],t=b.i===a.i?0:(idx-a.i)/(b.i-a.i);return a.v+(b.v-a.v)*clamp(t,0,1)};
    const pinches=[],widens=[];const pinchCount=Math.max(0,Math.floor((d-1)/2)),wideCount=1+Math.floor(d/3);
    for(let z=0;z<pinchCount;z++)pinches.push({c:(.16+this.rng()*.72)*(n-1),span:3.8+this.rng()*(5+d*.35),depth:.26+d*.085+this.rng()*.46,bias:(this.rng()-.5)*.9});
    for(let z=0;z<wideCount;z++)widens.push({c:(.12+this.rng()*.78)*(n-1),span:5+this.rng()*9,depth:.38+this.rng()*(.50+d*.05),bias:(this.rng()-.5)*.65});
    for(let idx=0;idx<n;idx++){
      let lw=interp(leftTargets,idx),rw=interp(rightTargets,idx);const wobble=(Math.sin((idx+this.seed%97)*.83)+Math.sin((idx+this.seed%43)*.29)*.55)*(.035+d*.009);lw+=wobble;rw-=wobble*.58;
      for(const z of pinches){const q=Math.abs(idx-z.c)/z.span;if(q<1){const f=(1-q)*(1-q),depth=z.depth*f;lw-=depth*(1+z.bias*.45);rw-=depth*(1-z.bias*.45)}}
      for(const z of widens){const q=Math.abs(idx-z.c)/z.span;if(q<1){const f=(1-q)*(1-q),depth=z.depth*f;lw+=depth*(1+z.bias*.35);rw+=depth*(1-z.bias*.35)}}
      // Technical bends can be tight on one side and roomy on the other, just like a hand-drawn course.
      if(d>=5){const h0=this.path[Math.max(0,idx-3)]?.heading??0,h1=this.path[Math.min(n-1,idx+3)]?.heading??h0,turn=headingDelta(h0,h1);if(turn){const f=Math.min(1,Math.abs(turn)/2)*(.10+d*.018);if(turn>0)rw-=f;else lw-=f}}
      if(idx<8){const startSide=3.55-d*.04;lw=Math.max(lw,startSide);rw=Math.max(rw,startSide)}if(Math.abs(idx-this.finishIndex)<5){lw=Math.max(lw,2.35);rw=Math.max(rw,2.35)}
      lw=clamp(lw,minSide,maxSide);rw=clamp(rw,minSide,maxSide);const minFull=d>=9?3.72:d>=7?3.86:d>=5?4.04:d>=3?4.68:5.38;if(lw+rw<minFull){const add=(minFull-lw-rw)/2;lw+=add;rw+=add}
      this.path[idx].leftWidth=lw;this.path[idx].rightWidth=rw;
    }
    // Tiny 3-point smoothing removes impossible saw-teeth but keeps the irregular hand-drawn rhythm.
    for(let pass=0;pass<2;pass++){const L=this.path.map(p=>p.leftWidth),R=this.path.map(p=>p.rightWidth);for(let j=1;j<n-1;j++){this.path[j].leftWidth=L[j]*.72+(L[j-1]+L[j+1])*.14;this.path[j].rightWidth=R[j]*.72+(R[j-1]+R[j+1])*.14}}
  }

  separateNearbyLanes(){
    // When a hairpin returns close to an older section, keep a visible paper gap
    // between the two road ribbons. This prevents accidental shortcuts where two
    // wide parallel pieces merge into one road surface.
    const d=this.difficulty,minSide=d>=9?1.50:d>=7?1.62:d>=5?1.76:2.10,n=this.path.length;
    for(let i=0;i<n;i++)for(let j=i+18;j<n;j++){
      const a=this.path[i],b=this.path[j],dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);if(dist<3.2||dist>9.2)continue;
      const da=DIRS[a.heading]||DIRS[0],db=DIRS[b.heading]||DIRS[0];if(Math.abs(da.x*db.x+da.y*db.y)<.92)continue;
      const na={x:-da.y,y:da.x},nb={x:-db.y,y:db.x},sa=(dx*na.x+dy*na.y)>=0?'leftWidth':'rightWidth',sb=((-dx)*nb.x+(-dy)*nb.y)>=0?'leftWidth':'rightWidth';
      let wa=a[sa],wb=b[sb],limit=dist-1.35;if(wa+wb<=limit)continue;
      let excess=wa+wb-limit,ra=Math.max(0,wa-minSide),rb=Math.max(0,wb-minSide),room=ra+rb;if(room<=0)continue;
      const cutA=Math.min(ra,excess*(ra/room)),cutB=Math.min(rb,excess*(rb/room));a[sa]-=cutA;b[sb]-=cutB;excess-=cutA+cutB;
      if(excess>1e-6){const ea=Math.min(Math.max(0,a[sa]-minSide),excess);a[sa]-=ea;excess-=ea;const eb=Math.min(Math.max(0,b[sb]-minSide),excess);b[sb]-=eb}
    }
  }

  deriveName(){const f=this.features;if(f.widthRange>4.2&&this.difficulty>=7)return'Рваный маркер';if(f.southSteps>18&&f.horizontalSteps>35)return'Скрепка';if(f.turns>18)return'Чернильная змея';if(f.minFullWidth<4.3&&this.difficulty>=8)return'Игла';if(f.spanX>68)return'Молния';const names=['Клетчатый вираж','Школьный серпантин','Маркерный круг','Ломаная линия','Тетрадный спринт','Диагональ','Кривой контур','Чернильный коридор'];return names[this.seed%names.length]}
  makeGateAt(index){const p=this.path[index],n=p.normal;return{a:{x:p.x+n.x*Math.max(2.8,p.leftWidth-.15),y:p.y+n.y*Math.max(2.8,p.leftWidth-.15)},b:{x:p.x-n.x*Math.max(2.8,p.rightWidth-.15),y:p.y-n.y*Math.max(2.8,p.rightWidth-.15)},center:{x:p.x,y:p.y},heading:p.heading}}
  buildBins(){
    this.bins.clear();const add=(rec,p)=>{const bx=Math.floor(p.x/this.binSize),by=Math.floor(p.y/this.binSize),k=`${bx},${by}`;if(!this.bins.has(k))this.bins.set(k,[]);this.bins.get(k).push(rec)};
    for(let i=0;i<this.path.length;i++)add({route:'main',index:i,progressIndex:i,localIndex:i,point:this.path[i]},this.path[i]);
    for(let bi=0;bi<(this.customBranches||[]).length;bi++){const b=this.customBranches[bi],den=Math.max(1,b.path.length-1);for(let i=0;i<b.path.length;i++){const progressIndex=b.fromIndex+(b.toIndex-b.fromIndex)*(i/den);add({route:'branch',branchIndex:bi,index:progressIndex,progressIndex,localIndex:i,point:b.path[i]},b.path[i])}}
    this.nodeInfoCache.clear();
  }
  nearbyIndices(x,y){const bx=Math.floor(x/this.binSize),by=Math.floor(y/this.binSize),out=[];for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const a=this.bins.get(`${bx+ox},${by+oy}`);if(a)out.push(...a)}if(out.length)return out;return this.path.map((p,i)=>({route:'main',index:i,progressIndex:i,localIndex:i,point:p}))}
  nearestInfo(pos){
    const integer=Number.isInteger(pos.x)&&Number.isInteger(pos.y),key=integer?`${pos.x},${pos.y}`:null;if(key&&this.nodeInfoCache.has(key))return this.nodeInfoCache.get(key);
    let best=null,bd=1e9;for(const rec of this.nearbyIndices(pos.x,pos.y)){const p=rec.point,d2=(pos.x-p.x)**2+(pos.y-p.y)**2;if(d2<bd){bd=d2;best={...rec,index:rec.progressIndex,dist:Math.sqrt(d2)}}}
    best=best||{route:'main',index:0,progressIndex:0,localIndex:0,point:this.path[0],dist:999};if(key)this.nodeInfoCache.set(key,best);return best;
  }

  addRoadPiece(poly){const bbox=polyBBox(poly),id=this.roadPieces.length;this.roadPieces.push({poly,bbox});const bs=this.roadBinSize,minBX=Math.floor((bbox.minX-.1)/bs),maxBX=Math.floor((bbox.maxX+.1)/bs),minBY=Math.floor((bbox.minY-.1)/bs),maxBY=Math.floor((bbox.maxY+.1)/bs);for(let bx=minBX;bx<=maxBX;bx++)for(let by=minBY;by<=maxBY;by++){const k=`${bx},${by}`;if(!this.roadPieceBins.has(k))this.roadPieceBins.set(k,[]);this.roadPieceBins.get(k).push(id)}}
  addRouteRoadGeometry(route){
    let prev=null;for(let i=0;i<route.length-1;i++){
      const a=route[i],b=route[i+1],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,n={x:-dy/L,y:dx/L};
      const l0={x:a.x+n.x*a.leftWidth,y:a.y+n.y*a.leftWidth},l1={x:b.x+n.x*b.leftWidth,y:b.y+n.y*b.leftWidth},r0={x:a.x-n.x*a.rightWidth,y:a.y-n.y*a.rightWidth},r1={x:b.x-n.x*b.rightWidth,y:b.y-n.y*b.rightWidth};
      this.addRoadPiece([l0,l1,r1,r0]);if(prev){const c={x:a.x,y:a.y};this.addRoadPiece([c,prev.l1,l0]);this.addRoadPiece([c,prev.r1,r0])}prev={l1,r1};
    }
  }
  buildRoadGeometry(){
    this.roadPieces=[];this.roadPieceBins.clear();this.edgeSegments=[];this.addRouteRoadGeometry(this.path);for(const b of this.customBranches||[])this.addRouteRoadGeometry(b.path);
  }
  isRoad(x,y){if(x<-4||x>this.w+4||y<-4||y>this.h+4)return false;const bs=this.roadBinSize,k=`${Math.floor(x/bs)},${Math.floor(y/bs)}`,ids=this.roadPieceBins.get(k)||[];for(const id of ids){const p=this.roadPieces[id],b=p.bbox;if(x<b.minX-.06||x>b.maxX+.06||y<b.minY-.06||y>b.maxY+.06)continue;if(pointInPoly(x,y,p.poly))return true}return false}
  roadMargin(pos){const n=this.nearestInfo(pos),dx=pos.x-n.point.x,dy=pos.y-n.point.y,off=dx*n.point.normal.x+dy*n.point.normal.y,limit=off>=0?n.point.leftWidth:n.point.rightWidth;return limit-Math.abs(off)}
  crossTrackOffset(pos){const n=this.nearestInfo(pos),dx=pos.x-n.point.x,dy=pos.y-n.point.y;return dx*n.point.normal.x+dy*n.point.normal.y}
  progressInfo(pos){const n=this.nearestInfo(pos);return{...n,steps:n.index-this.startIndex,progress:clamp((n.index-this.startIndex)/(this.finishIndex-this.startIndex),0,1.12)}}
  progress(pos){return this.progressInfo(pos).progress}
  routeForInfo(n){if(n?.route==='branch'&&this.customBranches?.[n.branchIndex])return this.customBranches[n.branchIndex].path;return this.path}
  headingAt(pos,look=0){const n=this.nearestInfo(pos),route=this.routeForInfo(n);if(n.route==='branch'){const i=clamp(Math.round(n.localIndex+look),0,route.length-1);return route[i].heading}const i=clamp(Math.round(n.index+look),0,this.path.length-1);return this.path[i].heading}
  curvatureAhead(pos,horizon=14){const n=this.nearestInfo(pos),route=this.routeForInfo(n),start=n.route==='branch'?Math.round(n.localIndex):clamp(Math.round(n.index),0,this.path.length-1),end=Math.min(route.length-1,start+horizon);let changes=0,maxDelta=0,last=route[start]?.heading??0,minWidth=99;for(let i=start+1;i<=end;i++){const h=route[i].heading,d=Math.abs(headingDelta(last,h));if(d){changes+=d;maxDelta=Math.max(maxDelta,d)}last=h;minWidth=Math.min(minWidth,(route[i].leftWidth+route[i].rightWidth)/2)}return{changes,maxDelta,minWidth}}
  safeSpeedAt(pos){const c=this.curvatureAhead(pos,12);let s=6;if(c.changes>=4)s=2;else if(c.changes>=2)s=3;else if(c.changes>=1)s=4;if(c.minWidth<2.5)s=Math.min(s,3);return s}
  finished(pos){return this.progress(pos)>=1}
  finishCrossingFraction(a,b){const t=segIntersectT(a,b,this.finishLine.a,this.finishLine.b);if(t!==null)return t;if(this.progress(a)<1&&this.progress(b)>=1)return 1;return null}

  generateDecor(){
    const types=['tree','tree','grass','grass','bush','flower','rock','tire','flag','house'];let serial=0;
    const visuallyClear=(x,y,scale)=>{if(this.isRoad(x,y))return false;const radius=.55*scale;for(let k=0;k<8;k++){const a=k*Math.PI/4;if(this.isRoad(x+Math.cos(a)*radius,y+Math.sin(a)*radius))return false}return true};
    for(let i=8;i<this.finishIndex;i+=5+Math.floor(this.rng()*5)){
      const p=this.path[i];for(const side of[-1,1]){if(this.rng()<.42)continue;const edge=side>0?p.leftWidth:p.rightWidth,off=edge+2.95+this.rng()*4.05,x=p.x+p.normal.x*off*side,y=p.y+p.normal.y*off*side,scale=(.75+this.rng()*.55)*1.30*1.18;if(x<2||x>this.w-2||y<2||y>this.h-2||!visuallyClear(x,y,scale))continue;const nearGate=Math.hypot(x-this.start.x,y-this.start.y)<5||Math.hypot(x-this.finish.x,y-this.finish.y)<5;if(nearGate)continue;this.decor.push({id:serial++,type:types[Math.floor(this.rng()*types.length)],x,y,rot:(this.rng()-.5)*.55,scale,side})}
    }
    for(let i=0;i<18;i++){const x=2+this.rng()*(this.w-4),y=2+this.rng()*(this.h-4);if(!this.isRoad(x,y))this.decor.push({id:serial++,type:'paper',x,y,rot:this.rng()*6.28,scale:.6+this.rng()*.8,side:0})}
  }

  generateItems(){
    const obstacleCount=1+Math.floor(this.difficulty*.55),itemCount=7+Math.floor(this.difficulty*.75);let tries=0;
    while(this.items.size<obstacleCount+itemCount&&tries++<3000){const idx=10+Math.floor(this.rng()*Math.max(1,this.finishIndex-22)),p=this.path[idx];if(!p)continue;const side=this.rng()<.5?-1:1,sideW=side>0?p.leftWidth:p.rightWidth,off=this.rng()<.52?0:side*Math.max(1,Math.min(2,Math.floor(sideW-1)));const x=Math.round(p.x+p.normal.x*off),y=Math.round(p.y+p.normal.y*off),key=`${x},${y}`;if(!this.isRoad(x,y)||this.items.has(key)||Math.hypot(x-this.start.x,y-this.start.y)<8)continue;
      const n=this.items.size;if(n<obstacleCount){const o=side*Math.max(1,Math.min(2,Math.floor(sideW-1))),ox=Math.round(p.x+p.normal.x*o),oy=Math.round(p.y+p.normal.y*o),ok=`${ox},${oy}`;if(this.items.has(ok)||!this.isRoad(ox,oy))continue;this.items.set(ok,{type:this.rng()<.55?'barrier':'oil'})}
      else{const r=this.rng();this.items.set(key,{type:r<.50?'coin':r<.73?'nitro':r<.89?'repair':'shield'})}
    }
  }
  itemAt(x,y){return this.items.get(`${Math.round(x)},${Math.round(y)}`)||null}
  removeItem(x,y){this.items.delete(`${Math.round(x)},${Math.round(y)}`)}
  isBlockedNode(x,y){return this.itemAt(x,y)?.type==='barrier'}

  segmentCheckMove(a,b){
    const cacheable=Number.isInteger(a.x)&&Number.isInteger(a.y)&&Number.isInteger(b.x)&&Number.isInteger(b.y),key=cacheable?`${a.x},${a.y}>${b.x},${b.y}`:null;if(key&&this.segmentCache.has(key))return this.segmentCache.get(key);
    const dx=b.x-a.x,dy=b.y-a.y,steps=Math.max(Math.abs(dx),Math.abs(dy)),straightOrDiagonal=(dx===0||dy===0||Math.abs(dx)===Math.abs(dy));
    if(!Number.isInteger(steps)||steps<1||!straightOrDiagonal){const r={ok:false,impact:{...a},lastGrid:{...a},reason:'invalid-vector'};if(key)this.segmentCache.set(key,r);return r}
    const sx=Math.sign(dx),sy=Math.sign(dy);let lastGrid={...a},result=null,prevInside={...a};
    const impactBetween=(inside,outside)=>{let lo={...inside},hi={...outside};for(let n=0;n<13;n++){const mid={x:(lo.x+hi.x)/2,y:(lo.y+hi.y)/2};if(this.isRoad(mid.x,mid.y))lo=mid;else hi=mid}return hi};
    for(let k=1;k<=steps;k++){
      const node={x:a.x+sx*k,y:a.y+sy*k},len=Math.hypot(node.x-lastGrid.x,node.y-lastGrid.y),samples=Math.max(28,Math.ceil(len/0.03));prevInside={...lastGrid};
      for(let j=1;j<=samples;j++){const t=j/samples,q={x:lastGrid.x+(node.x-lastGrid.x)*t,y:lastGrid.y+(node.y-lastGrid.y)*t};if(!this.isRoad(q.x,q.y)){result={ok:false,impact:impactBetween(prevInside,q),lastGrid:{...lastGrid},reason:'road-edge'};break}prevInside=q}
      if(result)break;if(this.isBlockedNode(node.x,node.y)){result={ok:false,impact:{...node},lastGrid:{...lastGrid},barrier:true,reason:'barrier'};break}lastGrid=node;
    }
    result=result||{ok:true,impact:{...b},lastGrid:{...b}};if(key)this.segmentCache.set(key,result);return result;
  }
  segmentCheck(a,b){return this.segmentCheckMove(a,b)}
}
