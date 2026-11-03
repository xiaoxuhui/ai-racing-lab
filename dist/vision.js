/* The policy receives ray distances, speed and a goal compass, never map
   coordinates, a shortest path, waypoints or a precomputed driving script. */
(()=>{'use strict';
const E=globalThis.Racing,OFFSETS=[-105,-70,-35,0,35,70,105].map(v=>v*Math.PI/180),ACTIONS=E.ACTIONS,DT=1/15;
const controls={straight:{throttle:0,brake:0,steer:0},accelerate:{throttle:1,brake:0,steer:0},decelerate:{throttle:0,brake:1,steer:0},left:{throttle:0,brake:0,steer:-1},right:{throttle:0,brake:0,steer:1}};
const fields=new WeakMap(),RES=24;
function surface(map){
 if(fields.has(map))return fields.get(map);const width=map.width*RES,height=map.height*RES,grid=new Uint8Array(width*height);
 // Rasterize only each road segment's bounds, including on large custom maps.
 for(const[ax,ay,bx,by]of map.segments){const dx=bx-ax,dy=by-ay,denom=dx*dx+dy*dy||1,x0=Math.max(0,Math.floor((Math.min(ax,bx)+.17)*RES)),x1=Math.min(width-1,Math.ceil((Math.max(ax,bx)+.83)*RES)),y0=Math.max(0,Math.floor((Math.min(ay,by)+.17)*RES)),y1=Math.min(height-1,Math.ceil((Math.max(ay,by)+.83)*RES));for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++){const x=(i+.5)/RES-.5,y=(j+.5)/RES-.5,t=E.clamp(((x-ax)*dx+(y-ay)*dy)/denom,0,1),ex=x-ax-t*dx,ey=y-ay-t*dy;if(ex*ex+ey*ey<=.33*.33)grid[j*width+i]=1;}}
 const field={grid,width,height};fields.set(map,field);return field;
}
function sameDeck(map,a,b){for(const k of map.bridges){const[x,y]=k.split(',').map(Number),near=s=>Math.abs(s.x-x)<.7&&Math.abs(s.y-y)<.7;if(near(a)||near(b)){const axis=s=>near(s)?(s.bridgeLock?.axis||(Math.abs(Math.cos(s.angle))>=Math.abs(Math.sin(s.angle))?'h':'v')):Math.abs(s.y-y)<.33?'h':Math.abs(s.x-x)<.33?'v':null,aa=axis(a),bb=axis(b);if(aa&&bb&&aa!==bb)return false;}}return true;}
function sense(map,state,range=4,vehicles=[]){
 const {grid,width,height}=surface(map),rays=[],bridges=[...map.bridges].map(k=>k.split(',').map(Number));
 const others=vehicles.filter(v=>v!==state&&!v.done&&(state.carId===undefined||v.carId!==state.carId)&&sameDeck(map,state,v));
 for(const offset of OFFSETS){const angle=state.angle+offset,dx=Math.cos(angle),dy=Math.sin(angle);let distance=0,hit=false,lock=state.bridgeLock;
  for(let d=.04;d<=range+.001;d+=.04){const x=state.x+dx*d,y=state.y+dy*d,i=Math.floor((x+.5)*RES),j=Math.floor((y+.5)*RES);
   let valid=i>=0&&i<width&&j>=0&&j<height&&!!grid[j*width+i];
   if(!lock)for(const[bx,by]of bridges)if(Math.abs(x-bx)<.5&&Math.abs(y-by)<.5){lock={x:bx,y:by,axis:Math.abs(dx)>Math.abs(dy)?'h':'v'};break;}
   if(lock){if(Math.abs(x-lock.x)>.7||Math.abs(y-lock.y)>.7)lock=null;else if((lock.axis==='h'?Math.abs(y-lock.y):Math.abs(x-lock.x))>.33)valid=false;}
   if(!valid){hit=true;break;}distance=d;
  }
  if(!hit)distance=range;const roadDistance=distance;let kind=hit?'edge':'clear',vehicleId=null;
  for(const other of others){const ox=other.x-state.x,oy=other.y-state.y,t=ox*dx+oy*dy,perp=ox*ox+oy*oy-t*t,radius=.26;if(perp>radius*radius)continue;const half=Math.sqrt(Math.max(0,radius*radius-perp));if(t+half<0)continue;const entry=Math.max(0,t-half);if(entry<distance){distance=entry;hit=true;kind='car';vehicleId=other.carId??null;}}
  rays.push({offset,angle,distance,roadDistance,hit,kind,vehicleId});
 }
 const a=Math.atan2(map.goal[1]-state.y,map.goal[0]-state.x)-state.angle;
 return {rays,range,speed:state.speed,goalBearing:Math.atan2(Math.sin(a),Math.cos(a)),goalDistance:Math.hypot(map.goal[0]-state.x,map.goal[1]-state.y)};
}
function legacyObservationKey(o){const bin=v=>v<.25?0:v<.65?1:2;const base=o.rays.map(r=>bin(r.distance)).join('')+':'+Math.floor((o.goalBearing+Math.PI)/(Math.PI/4))%8+':'+(o.speed<.2?0:o.speed<.8?1:o.speed<1.6?2:o.speed<3?3:4),traffic=o.rays.reduce((mask,r,i)=>r.kind==='car'?mask|(1<<i):mask,0);return base+(traffic?':cars'+traffic:'');}
function observationKey(o){const bin=v=>v<.16?0:v<.28?1:v<.42?2:v<.65?3:v<1?4:v<1.6?5:v<2.6?6:7,traffic=o.rays.reduce((mask,r,i)=>r.kind==='car'?mask|(1<<i):mask,0);return 'm4:'+o.rays.map(r=>bin(r.distance)).join('')+':'+Math.floor((o.goalBearing+Math.PI)/(Math.PI/8))%16+':'+(o.speed<.2?0:o.speed<.8?1:o.speed<1.6?2:o.speed<3?3:4)+(traffic?':cars'+traffic:'');}
function policyKey(o){return observationKey({...o,rays:o.rays.map(r=>({...r,distance:r.roadDistance??r.distance,kind:'edge'}))});}
function distanceDiscount(distance){return Math.pow(.98,Math.max(0,distance));}
function newlyVisited(before,after,visited){
 if(before.x===after.x&&before.y===after.y)return 0;
 const cuts=[0,1];
 for(const axis of ['x','y']){const a=before[axis],b=after[axis];if(a===b)continue;for(let k=Math.floor(Math.min(a,b)*2)+1;k<=Math.floor(Math.max(a,b)*2);k++){const t=(k/2-a)/(b-a);if(t>0&&t<1)cuts.push(t);}}
 cuts.sort((a,b)=>a-b);let count=0;
 const add=t=>{const x=before.x+(after.x-before.x)*t,y=before.y+(after.y-before.y)*t,key=Math.floor(x*2)+','+Math.floor(y*2);if(!visited.has(key)){visited.add(key);count++;}};
 for(let i=1;i<cuts.length;i++)add((cuts[i-1]+cuts[i])/2);add(1);return count;
}
function rewardFor(map,before,after,visited){
 // Bound repeated circling by actual travel, never by how slowly a car drives.
 const repeating=after.distance>Math.max(100,map.roads.size*8);
 if(!after.done&&repeating){after.done=true;after.reason='重复行驶路程过多，重新探索';}
 const old=Math.hypot(before.x-map.goal[0],before.y-map.goal[1]),dist=Math.hypot(after.x-map.goal[0],after.y-map.goal[1]);
 let reward=3*(old-dist)-.02*Math.max(0,after.distance-before.distance);
 reward+=.08*newlyVisited(before,after,visited);
 if(after.done&&!after.truncated)reward+=after.won?80:repeating?-5:-15;
 return reward;
}
class VisionEnvironment{
 constructor(map,config,range=4){this.map=map;this.config=config;this.range=range;this.state=E.continuousInitial(map);this.visited=new Set();}
 observe(){return sense(this.map,this.state,this.range);}
 step(action){const before=this.state;let s=before;for(let i=0;i<8&&!s.done;i++)s=E.advanceManual(this.map,s,controls[action],1/120,this.config);this.state=s;const reward=rewardFor(this.map,before,s,this.visited);return {observation:this.observe(),reward,done:s.done,distance:Math.max(0,s.distance-before.distance),truncated:!!s.truncated};}
}
class VisionLearner{
 constructor(data){this.memoryLimit=data?.memoryLimit||4096;this.outcomeLimit=data?.outcomeLimit||512;this.q=data?.q||{};this.episodes=data?.episodes||0;this.results=data?.results||[];this.best=data?.best??null;this.bestDistance=Number.isFinite(data?.bestDistance)?data.bestDistance:null;this.history=data?.history||[];this.distances=data?.distances||[];this.longestSurvival=Number.isFinite(data?.longestSurvival)?Math.max(0,data.longestSurvival):0;this.hasCleared=!!data?.hasCleared||this.best!==null||this.results.includes(1);this.buffer=[];this.lastReward=0;this.experience=(data?.experience||[]).slice(-this.memoryLimit);this.outcomes=(data?.outcomes||[]).slice(-this.outcomeLimit);this.transitions=Math.max(data?.transitions||0,this.experience.length);this.terminalTransitions=Math.max(data?.terminalTransitions||0,this.outcomes.length);this.replays=data?.replays||0;}
 values(observation){const k=policyKey(observation);return this.q[k]||(this.q[k]=[...(this.q[observationKey(observation)]||this.q[legacyObservationKey(observation)]||[.02,0,0,0,0])]);}
 choose(observation,epsilon=0){this.lastChoiceExploratory=epsilon>0&&Math.random()<epsilon;if(this.lastChoiceExploratory)return ACTIONS[Math.floor(Math.random()*ACTIONS.length)];const q=this.values(observation),m=Math.max(...q),choices=q.map((v,i)=>v===m?i:-1).filter(i=>i>=0);return ACTIONS[choices[Math.floor(Math.random()*choices.length)]];}
 learn(o,a,next,reward,done,stream=this.buffer,step={distance:1}){
  this.lastReward=reward;const key=policyKey(o),nextKey=policyKey(next),index=ACTIONS.indexOf(a),row=this.values(o),nextRow=this.values(next);
  // Watkins Q(lambda): an exploratory, non-greedy action breaks earlier credit.
  // Its later failure must not blame the safe choices before that deviation.
  if(row[index]<Math.max(...row)-1e-10)stream.length=0;
  const duplicate=stream.findIndex(t=>t.key===key&&t.index===index);if(duplicate>=0)stream.splice(duplicate,1);
  const distance=Math.max(0,step.distance??1),discount=distanceDiscount(distance),terminal=done;
  stream.push({key,index,distance});if(stream.length>96)stream.shift();
  const delta=reward+(terminal?0:discount*Math.max(...nextRow))-row[index];let eligibility=1;
  for(let i=stream.length-1;i>=0&&eligibility>.001;i--){const t=stream[i];this.q[t.key][t.index]+=.18*delta*eligibility;eligibility*=distanceDiscount(t.distance)*Math.pow(.85,t.distance);}
  if(done)stream.length=0;
  // Replay earlier episodes as well as the current one. Each car's eligibility
  // trace stays private; only its own real transitions enter each driver’s durable memory.
  const replay=t=>{if(!t||t.rewardVersion!==3||(t.done&&t.reward===0&&t.discount===1))return;const r=this.q[t.key],n=this.q[t.nextKey];if(!r||!n)return;r[t.index]+=.06*(t.reward+(t.done?0:t.discount*Math.max(...n))-r[t.index]);this.replays++;};
  for(let i=0;i<2&&this.experience.length;i++)replay(this.experience[Math.floor(Math.random()*this.experience.length)]);
  if(this.transitions%4===0&&this.outcomes.length)replay(this.outcomes[Math.floor(Math.random()*this.outcomes.length)]);
  const transition={key,index,nextKey,reward,done:terminal,discount,rewardVersion:3};this.transitions++;
  if(this.experience.length<this.memoryLimit)this.experience.push(transition);else{const slot=Math.floor(Math.random()*this.transitions);if(slot<this.memoryLimit)this.experience[slot]=transition;}
  if(done){this.terminalTransitions++;if(this.outcomes.length<this.outcomeLimit)this.outcomes.push(transition);else{const slot=Math.floor(Math.random()*this.terminalTransitions);if(slot<this.outcomeLimit)this.outcomes[slot]=transition;}}
 }
 observeSurvival(s){if(Number.isFinite(s.time)&&s.time>=0)this.longestSurvival=Math.max(this.longestSurvival,s.time);if(s.won){this.hasCleared=true;if(Number.isFinite(s.distance)&&(this.bestDistance===null||s.distance<this.bestDistance))this.bestDistance=s.distance;if(Number.isFinite(s.time)&&(this.best===null||s.time<this.best))this.best=s.time;}}
 record(s){this.observeSurvival(s);this.buffer=[];this.episodes++;this.results.push(s.won?1:0);if(this.results.length>100)this.results.shift();this.distances.push(s.distance);if(this.distances.length>100)this.distances.shift();if(this.episodes%20===0){this.history.push(this.results.reduce((a,b)=>a+b,0)/this.results.length);if(this.history.length>40)this.history.shift();}}
 episode(map,config,epsilon=.2,range=4){this.buffer=[];const env=new VisionEnvironment(map,config,range);let o=env.observe();while(!env.state.done){const a=this.choose(o,epsilon),r=env.step(a);this.learn(o,a,r.observation,r.reward,r.done,this.buffer,r);o=r.observation;}this.record(env.state);return env.state;}
 serialize(){return {memoryLimit:this.memoryLimit,outcomeLimit:this.outcomeLimit,q:this.q,episodes:this.episodes,results:this.results,best:this.best,bestDistance:this.bestDistance,history:this.history,distances:this.distances,longestSurvival:this.longestSurvival,hasCleared:this.hasCleared,experience:this.experience,outcomes:this.outcomes,transitions:this.transitions,terminalTransitions:this.terminalTransitions,replays:this.replays};}
}
Object.assign(E,{VISION_OFFSETS:OFFSETS,CONTROL_DT:DT,CONTROLS:controls,sense,observationKey,policyKey,distanceDiscount,rewardFor,sameDeck,VisionEnvironment,VisionLearner});
})();
