/* Cars can see one another, but pass through without physical collisions.
   Replay histories, live trajectories and death snapshots belong to each car. */
(()=>{'use strict';
const E=globalThis.Racing;
const copy=value=>JSON.parse(JSON.stringify(value));
function compareScore(a,b){if(!b)return 1;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1e-8)return a[i]>b[i]?1:-1;return 0;}
function distanceScore(state,coverage,map){return [state.won?1:0,state.won?-state.distance:coverage,state.won?0:-Math.hypot(state.x-map.goal[0],state.y-map.goal[1]),-state.distance];}
function evaluatePolicy(model,map,config,range=4){
 const policy=new E.VisionLearner(copy(model)),env=new E.VisionEnvironment(map,config,range);
 // This is an offline calculation, not the live car. A fixed point needs no
 // further evaluation; a calculation budget also keeps rotating policies from
 // blocking the UI. Neither condition kills or restarts any live vehicle.
 let steps=0,evaluationLimited=false;
 while(!env.state.done){const q=policy.values(env.observe()),before=env.state;env.step(E.ACTIONS[q.indexOf(Math.max(...q))]);const after=env.state;if(!after.done&&before.x===after.x&&before.y===after.y&&before.speed===after.speed&&before.angle===after.angle){evaluationLimited=true;break;}if(++steps>=12000&&!after.done){evaluationLimited=true;break;}}
 const s=env.state;
 return {score:distanceScore(s,env.visited.size,map),scoreVersion:2,won:s.won,time:s.time,distance:s.distance,coverage:env.visited.size,evaluationLimited,model:policy.serialize()};
}
class FleetWorld{
 constructor(map,learner,config,count=8,range=4){
  this.map=map;this.learner=learner;this.config=config;this.range=range;this.time=0;this.nextSpawn=0;this.events=[];this.deaths=0;this.historyVersion=0;
  this.cars=Array.from({length:E.clamp(Math.trunc(Number(count)||8),1,16)},(_,id)=>({id,learner:learner.forCar?learner.forCar(id):learner,state:{...E.continuousInitial(map),carId:id},active:false,waiting:true,finished:false,readyAt:id*.25,decision:null,ticks:0,visited:new Set(),buffer:[],trail:[],trailVersion:0,lastDeath:null,lastReward:0,attempts:0}));
  this.spawn(this.cars[0]);
 }
 states(){return this.cars.filter(c=>c.active&&!c.state.done).map(c=>c.state);}
 observe(car){return E.sense(this.map,car.state,this.range,this.states());}
 spawn(car){
  if(this.learner.reviewChampion)this.learner.selectChampion(this.map,this.config,this.range,true);
  if(this.learner.inheritChampion)car.learner=this.learner.inheritChampion(car.id,this.map,this.config,this.range);
  const fresh={...E.continuousInitial(this.map),carId:car.id};
  car.state=fresh;car.active=true;car.waiting=false;car.finished=false;car.decision=null;car.ticks=0;car.lastReward=0;car.visited=new Set();car.buffer=[];car.trail=[[fresh.x,fresh.y]];car.trailVersion++;car.attempts++;this.nextSpawn=this.time+.4;return true;
 }
 restartCar(id){const c=this.cars[id];if(!c)return;c.active=false;c.waiting=true;c.finished=false;c.readyAt=this.time;c.decision=null;c.buffer=[];}
 drainEvents(){return this.events.splice(0);}
 clearHistory(){this.deaths=0;this.historyVersion++;for(const car of this.cars){car.lastDeath=null;car.trail=car.active?[[car.state.x,car.state.y]]:[];car.trailVersion++;}}
 get allFinished(){return this.cars.every(c=>c.finished&&!c.waiting&&!c.active);}
 step(dt,{manualId=-1,control=E.CONTROLS.straight,epsilon=.02,repeat=true}={}){
  this.time+=dt;
  for(const car of this.cars)if(car.finished&&!car.waiting&&repeat){car.waiting=true;car.readyAt=Math.max(car.readyAt,this.time+.55);}
  if(this.time>=this.nextSpawn){const queue=this.cars.filter(c=>c.waiting&&this.time>=c.readyAt).sort((a,b)=>a.readyAt-b.readyAt||a.id-b.id);if(queue.length)this.spawn(queue[0]);}
  const beforeStates=this.states(),active=this.cars.filter(c=>c.active&&!c.state.done);
  // Observe and choose before moving any car, so each sees the same instant.
  for(const car of active){
   if(car.id===manualId){car.decision=null;car.buffer=[];continue;}
   if(!car.decision){const seen=E.sense(this.map,car.state,this.range,beforeStates),elite=this.learner.champion?.id===car.id,q=elite?car.learner.values(seen):null;car.decision={before:car.state,observation:seen,elite,action:elite?E.ACTIONS[q.indexOf(Math.max(...q))]:car.learner.choose(seen,epsilon)};car.lastExploratory=!elite&&!!car.learner.lastChoiceExploratory;car.ticks=0;}
  }
  for(const car of active){const chosen=car.id===manualId?control:E.CONTROLS[car.decision.action];car.state=E.advanceManual(this.map,car.state,chosen,dt,this.config);car.ticks++;}
  // No vehicle-to-vehicle contact test: overlapping cars remain independent.
  const afterStates=this.states();
  for(const car of active){
   const manual=car.id===manualId;
   if(!manual&&(car.ticks>=8||car.state.done)){
    const decision=car.decision,seen=E.sense(this.map,car.state,this.range,afterStates),reward=E.rewardFor(this.map,decision.before,car.state,car.visited,decision.action),fixedPoint=decision.before.x===car.state.x&&decision.before.y===car.state.y&&decision.before.speed===car.state.speed&&decision.before.angle===car.state.angle;
    if(!decision.elite||car.state.distance===decision.before.distance)car.learner.learn(decision.observation,decision.action,seen,reward,car.state.done,car.buffer,{distance:Math.max(0,car.state.distance-decision.before.distance),fixedPoint,truncated:!!car.state.truncated});car.lastReward=reward;car.decision=null;car.ticks=0;
   }
   car.learner.observeSurvival(car.state);if(car.learner!==this.learner)this.learner.observeSurvival(car.state);
   const p=car.trail.at(-1),moved=p?Math.hypot(car.state.x-p[0],car.state.y-p[1]):Infinity;if(moved>.06||(car.state.done&&moved>1e-8)){car.trail.push([car.state.x,car.state.y]);if(car.trail.length>1200){const last=car.trail.length-1;car.trail=car.trail.filter((_,i)=>i%2===0||i===last);}car.trailVersion++;}
   if(car.state.done){
    car.active=false;car.finished=true;car.waiting=false;car.readyAt=this.time+.55;car.finishedAt=this.time;
    if(!car.state.won&&!car.state.truncated){this.deaths++;car.lastDeath={state:{...car.state},trail:car.trail.map(p=>[...p]),attempt:car.attempts,version:++this.historyVersion};}
    if(!manual){car.learner.record(car.state);if(car.learner!==this.learner)this.learner.record(car.state);this.learner.consider?.(car.id,car.state,car.visited.size,this.map);}car.buffer=[];
    this.events.push({id:car.id,state:{...car.state},manual});
   }
  }
  if(this.learner.selectionDue)this.learner.selectChampion(this.map,this.config,this.range);
 }
}
// Drivers learn independently. Only a saved, evaluated champion can teach
// followers; independent explorers keep searching for a better policy.
class FleetLearner{
 constructor(data){
  this.summary=new E.VisionLearner(data?.fleetVersion?data.summary:data);this.drivers=new Map();this.buffer=[];this.champion=data?.champion||null;this.reviewChampion=!!this.champion&&this.champion.scoreVersion!==2;this.applied=data?.applied||{};this.sources=data?.sources||{};this.candidates=new Map();this.lastSelection=this.summary.episodes;
  if(data?.fleetVersion){for(const[id,model]of Object.entries(data.drivers||{}))this.drivers.set(Number(id),new E.VisionLearner(model));}
  else if(data){this.drivers.set(0,new E.VisionLearner(data));}
  this.summary.q={};this.summary.experience=[];this.summary.outcomes=[];
 }
 forCar(id){if(!this.drivers.has(id))this.drivers.set(id,new E.VisionLearner({memoryLimit:512,outcomeLimit:64}));return this.drivers.get(id);}
 observeSurvival(state){this.summary.observeSurvival(state);}
 record(state){this.summary.record(state);}
 consider(id,state,coverage,map){const score=distanceScore(state,coverage,map),previous=this.candidates.get(id);if(!previous||compareScore(score,previous)>0)this.candidates.set(id,score);}
 get selectionDue(){return this.summary.episodes-this.lastSelection>=Math.max(16,this.drivers.size*2);}
 selectChampion(map,config,range=4,force=false){
  const ids=force?[...this.drivers.keys()]:[...this.candidates].sort((a,b)=>compareScore(b[1],a[1])).slice(0,3).map(([id])=>id);
  this.lastSelection=this.summary.episodes;this.candidates.clear();this.reviewChampion=false;
  let best=this.champion?{...evaluatePolicy(this.champion.model,map,config,range),id:this.champion.id}:null,changed=false;
  for(const id of ids){const result=evaluatePolicy(this.forCar(id).serialize(),map,config,range);if(!best||compareScore(result.score,best.score)>0){best={...result,id};changed=true;}}
  if(changed)this.champion={...best,generation:(this.champion?.generation||0)+1};else if(this.champion&&best){const generation=this.champion.generation;this.champion={...best,generation};}
  return changed;
 }
 inheritChampion(id,map,config,range=4){
  const own=this.forCar(id),champion=this.champion;
  if(!champion||(id!==champion.id&&(id%4===3||this.applied[id]===champion.generation)))return own;
  this.applied[id]=champion.generation;
  // Never overwrite a driver's independently improved policy with a worse one.
  if(id!==champion.id){const evaluation=evaluatePolicy(own.serialize(),map,config,range);if(compareScore(evaluatePolicy(champion.model,map,config,range).score,evaluation.score)<=0)return own;}
  const stats=own.serialize(),model=copy(champion.model);
  for(const key of ['episodes','results','best','bestDistance','history','distances','longestSurvival','hasCleared','memoryLimit','outcomeLimit'])model[key]=stats[key];
  const follower=new E.VisionLearner(model);this.drivers.set(id,follower);this.sources[id]={id:champion.id,generation:champion.generation};return follower;
 }
 role(id){return this.champion?.id===id?'冠军':id%4===3?'独立探索':this.sources[id]?`学习 ${String(this.sources[id].id+1).padStart(2,'0')} 号 · 第 ${this.sources[id].generation} 代`:'等待选优';}
 serialize(){return {fleetVersion:1,summary:this.summary.serialize(),champion:this.champion,applied:this.applied,sources:this.sources,drivers:Object.fromEntries([...this.drivers].map(([id,model])=>[id,model.serialize()]))};}
}
for(const key of ['episodes','results','best','bestDistance','history','distances','longestSurvival','hasCleared'])Object.defineProperty(FleetLearner.prototype,key,{get(){return this.summary[key];}});
Object.assign(E,{FleetWorld,FleetLearner,evaluatePolicy,compareScore,distanceScore});
})();
