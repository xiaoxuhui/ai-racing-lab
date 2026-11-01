/* Map geometry, manual motion and an optional reference route for the editor.
   Sensor-based learned driving is implemented separately in vision.js. */
(function(root){
 'use strict';
 const DIRS=[[1,0],[0,1],[-1,0],[0,-1]],SPEEDS=[.5,1,3,6],ACTIONS=['straight','accelerate','decelerate','left','right'];
 const key=(x,y)=>`${x},${y}`,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const edgeKey=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
 function makeMap(index,custom){
  const roads=new Set(),edges=new Set(),segments=[],bridges=new Set(),width=clamp(Math.trunc(Number(custom?.width)||17),5,40),height=clamp(Math.trunc(Number(custom?.height)||11),5,30);
  function line(x1,y1,x2,y2){segments.push([x1,y1,x2,y2]);const dx=Math.sign(x2-x1),dy=Math.sign(y2-y1);let x=x1,y=y1;roads.add(key(x,y));while(x!==x2||y!==y2){const old=key(x,y);x+=dx;y+=dy;roads.add(key(x,y));edges.add(edgeKey(old,key(x,y)));}}
  if(custom){
   for(const k of custom.roads||[])if(/^\d+,\d+$/.test(k)){const[x,y]=k.split(',').map(Number);if(x<width&&y<height)roads.add(k);}
   for(const k of custom.bridges||[])if(roads.has(k))bridges.add(k);
   if(Array.isArray(custom.edges)){for(const e of custom.edges){if(typeof e!=='string')continue;const parts=e.split('|');if(parts.length!==2)continue;const[a,b]=parts;if(!roads.has(a)||!roads.has(b))continue;const[x,y]=a.split(',').map(Number),[bx,by]=b.split(',').map(Number);if(Math.abs(x-bx)+Math.abs(y-by)===1)edges.add(edgeKey(a,b));}}
   else{ // Preserve older saved maps; all newly edited maps store explicit edges.
    for(const k of roads){const[x,y]=k.split(',').map(Number);for(const[dx,dy]of [[1,0],[0,1]])if(roads.has(key(x+dx,y+dy)))edges.add(edgeKey(k,key(x+dx,y+dy)));}
   }
   for(const k of roads){const[x,y]=k.split(',').map(Number);segments.push([x,y,x,y]);}
   for(const e of edges){const[a,b]=e.split('|'),[x,y]=a.split(',').map(Number),[bx,by]=b.split(',').map(Number);segments.push([x,y,bx,by]);}
  }
  else if(index===0){line(0,8,14,8);line(4,8,4,5);line(4,5,14,5);line(12,5,12,2);line(6,2,16,2);line(6,1,6,9);line(14,5,14,8);bridges.add('6,5');}
  else if(index===1){line(0,8,12,8);line(3,8,3,2);line(3,2,16,2);line(8,1,8,9);line(3,5,14,5);line(12,2,12,8);line(14,5,14,9);}
  else{line(0,8,14,8);line(2,8,2,2);line(2,2,16,2);line(14,2,14,8);line(2,5,14,5);line(9,2,9,8);bridges.add('9,5');}
  const endpoint=(name,fallback)=>{const p=custom&&Object.hasOwn(custom,name)?custom[name]:fallback;return Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)&&p[0]>=0&&p[0]<width&&p[1]>=0&&p[1]<height?[...p]:null;};
  const map={index,width,height,roads,edges,segments,bridges,start:endpoint('start',[0,8]),goal:endpoint('goal',[16,2]),startDir:clamp(Math.trunc(Number(custom?.startDir)||0),0,3)};
  const reverse=new Map();
  for(const pos of roads){const[x,y]=pos.split(',').map(Number);for(let d=0;d<4;d++){const from=`${x},${y},${d}`;for(const nd of [d,(d+1)%4,(d+3)%4]){if(bridges.has(pos)&&nd!==d)continue;const nx=x+DIRS[nd][0],ny=y+DIRS[nd][1];if(!edges.has(edgeKey(pos,key(nx,ny))))continue;const to=`${nx},${ny},${nd}`;if(!reverse.has(to))reverse.set(to,[]);reverse.get(to).push(from);}}}
  map.dist=new Map();const queue=[];if(map.goal)for(let d=0;d<4;d++){const k=`${map.goal[0]},${map.goal[1]},${d}`;map.dist.set(k,0);queue.push(k);}for(let i=0;i<queue.length;i++){const k=queue[i];for(const p of reverse.get(k)||[]){if(!map.dist.has(p)){map.dist.set(p,map.dist.get(k)+1);queue.push(p);}}}return map;
 }
 function serializeMap(map){return {width:map.width,height:map.height,roads:[...map.roads],edges:[...map.edges],bridges:[...map.bridges],start:map.start?[...map.start]:null,goal:map.goal?[...map.goal]:null,startDir:map.startDir};}
 function resizeMap(data,width,height){return serializeMap(makeMap(3,{...data,width,height}));}
 function drivingIssue(map){if(!map.start)return '请放置入口';if(!map.goal)return '请放置出口';if(key(...map.start)===key(...map.goal))return '入口和出口需要放在不同位置';if(!map.roads.has(key(...map.start))||!map.roads.has(key(...map.goal)))return '请补齐入口与出口所在的道路';return '';}
 function mapIssue(map){if(!map.start)return '请放置入口';if(!map.goal)return '请放置出口';if(key(...map.start)===key(...map.goal))return '入口和出口需要放在不同位置';if(!map.roads.has(key(...map.start))||!map.roads.has(key(...map.goal)))return '请补齐入口与出口所在的道路';if(!map.dist.has(`${map.start[0]},${map.start[1]},${map.startDir}`))return '入口尚未连通出口，请补齐道路或调整入口朝向';for(const k of map.bridges){const[x,y]=k.split(',').map(Number);if(!DIRS.every(([dx,dy])=>map.edges.has(edgeKey(k,key(x+dx,y+dy)))))return '高架桥需连接四个方向的道路';}return '';}
 function initial(map){return {x:map?.start?.[0]??0,y:map?.start?.[1]??8,d:map?.startDir??0,v:1,steps:0,time:0,done:false,won:false,reason:'',action:'straight'};}
 function stateKey(s){return `${s.x},${s.y},${s.d},${s.v}`;}
 function transition(map,s,a){
  if(s.done)return {state:{...s},reward:0};const n={...s,steps:s.steps+1,action:a};
  if(a==='accelerate')n.v=Math.min(3,s.v+1);if(a==='decelerate')n.v=Math.max(0,s.v-1);n.time+=1/SPEEDS[s.v];
  if((a==='left'||a==='right')&&map.bridges.has(key(s.x,s.y))){n.done=true;n.reason='高架上下道路不连通';return {state:n,reward:-35};}
  if(a==='left')n.d=(n.d+3)%4;if(a==='right')n.d=(n.d+1)%4;n.x+=DIRS[n.d][0];n.y+=DIRS[n.d][1];
  if(!map.edges.has(edgeKey(key(s.x,s.y),key(n.x,n.y)))){n.done=true;n.reason='驶出道路';return {state:n,reward:-35};}
  if(n.x===map.goal[0]&&n.y===map.goal[1]){n.done=true;n.won=true;n.reason='成功抵达出口';return {state:n,reward:120};}
  if(n.steps>=map.width*map.height*4){n.done=true;n.reason='本轮探索结束';return {state:n,reward:-20};}
  const before=map.dist.get(`${s.x},${s.y},${s.d}`)??50,after=map.dist.get(`${n.x},${n.y},${n.d}`)??50;
  return {state:n,reward:1.4*(before-after)-.15-.28/SPEEDS[s.v]};
 }
 function reference(map){if(!map.start||!map.goal)return [];let s=initial(map);const points=[s],seen=new Set();while(!s.done){const k=stateKey(s);if(seen.has(k))break;seen.add(k);const options=['straight','left','right'].map(a=>transition(map,s,a).state).filter(n=>!n.done||n.won).sort((a,b)=>(map.dist.get(`${a.x},${a.y},${a.d}`)??999)-(map.dist.get(`${b.x},${b.y},${b.d}`)??999));if(!options.length)break;s=options[0];points.push(s);}return points;}
 function smoothPath(points){
  const samples=[];function add(x,y,v){const prev=samples[samples.length-1],distance=prev?prev.distance+Math.hypot(x-prev.x,y-prev.y):0;samples.push({x,y,v,distance});}
  function line(a,b,v){const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.035));for(let i=1;i<=n;i++){const t=i/n;add(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,v);}}
  if(!points.length)return [];add(points[0].x,points[0].y,SPEEDS[points[0].v]);let cursor=points[0];
  for(let i=1;i<points.length;i++){const p=points[i],prev=points[i-1],next=points[i+1],v=SPEEDS[p.v];if(next&&(p.x-prev.x!==next.x-p.x||p.y-prev.y!==next.y-p.y)){const r=.32,a={x:p.x-(p.x-prev.x)*r,y:p.y-(p.y-prev.y)*r},b={x:p.x+(next.x-p.x)*r,y:p.y+(next.y-p.y)*r};line(cursor,a,v);for(let j=1;j<=24;j++){const t=j/24,u=1-t;add(u*u*a.x+2*u*t*p.x+t*t*b.x,u*u*a.y+2*u*t*p.y+t*t*b.y,v);}cursor=b;}else{line(cursor,p,v);cursor=p;}}
  return samples;
 }
 function onRoad(map,x,y){return map.segments.some(([ax,ay,bx,by])=>{const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-ax-t*dx,y-ay-t*dy)<=.33;});}
 function continuousInitial(map){return {x:map.start[0],y:map.start[1],angle:map.startDir*Math.PI/2,speed:1,distance:0,time:0,done:false,won:false,reason:'',action:'straight',bridgeLock:null,idleTime:0};}
 function advanceManual(map,state,control,dt,config){
  if(state.done)return state;const s={...state},old=s.speed;s.speed=clamp(s.speed+(control.throttle-control.brake)*config.acceleration*dt,0,config.maxSpeed);s.angle+=control.steer*config.steering*(1+s.speed*.75)*dt;const distance=(old+s.speed)/2*dt;s.x+=Math.cos(s.angle)*distance;s.y+=Math.sin(s.angle)*distance;s.distance+=distance;s.time+=dt;s.action=control.steer<0?'left':control.steer>0?'right':control.throttle?'accelerate':control.brake?'decelerate':'straight';
  for(const k of map.bridges){const[x,y]=k.split(',').map(Number);if(Math.abs(s.x-x)<.5&&Math.abs(s.y-y)<.5&&!s.bridgeLock)s.bridgeLock={x,y,axis:Math.abs(Math.cos(s.angle))>Math.abs(Math.sin(s.angle))?'h':'v'};}
  if(s.bridgeLock){const b=s.bridgeLock;if(Math.abs(s.x-b.x)>.7||Math.abs(s.y-b.y)>.7)s.bridgeLock=null;else if((b.axis==='h'?Math.abs(s.y-b.y):Math.abs(s.x-b.x))>.33){s.done=true;s.reason='碰到高架护栏';}}
  if(!onRoad(map,s.x,s.y)){s.done=true;s.reason='驶出道路';}if(Math.hypot(s.x-map.goal[0],s.y-map.goal[1])<.34){s.done=true;s.won=true;s.reason='成功抵达出口';}return s;
 }
 const api={DIRS,SPEEDS,ACTIONS,key,edgeKey,clamp,makeMap,serializeMap,resizeMap,mapIssue,drivingIssue,initial,stateKey,transition,reference,smoothPath,onRoad,continuousInitial,advanceManual};root.Racing=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
