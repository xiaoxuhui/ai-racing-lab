/* All cars inhabit one continuous world, see its other cars, and update one
   shared Q table. Replay histories belong to cars, never to the whole fleet. */
(()=>{'use strict';
const E=globalThis.Racing,SPAWN_GAP=.55,COLLISION_DISTANCE=.43;
class FleetWorld{
 constructor(map,learner,config,count=8,range=4){
  this.map=map;this.learner=learner;this.config=config;this.range=range;this.time=0;this.nextSpawn=0;this.events=[];this.collisions=0;
  this.cars=Array.from({length:E.clamp(Math.trunc(Number(count)||8),1,16)},(_,id)=>({id,state:{...E.continuousInitial(map),carId:id},active:false,waiting:true,finished:false,readyAt:id*.25,decision:null,ticks:0,visited:new Set(),buffer:[],trail:[],lastReward:0,attempts:0}));
  this.spawn(this.cars[0]);
 }
 states(){return this.cars.filter(c=>c.active&&!c.state.done).map(c=>c.state);}
 observe(car){return E.sense(this.map,car.state,this.range,this.states());}
 spawn(car){
  const fresh={...E.continuousInitial(this.map),carId:car.id};
  if(this.cars.some(c=>c.active&&!c.state.done&&E.sameDeck(this.map,fresh,c.state)&&Math.hypot(c.state.x-fresh.x,c.state.y-fresh.y)<SPAWN_GAP))return false;
  car.state=fresh;car.active=true;car.waiting=false;car.finished=false;car.decision=null;car.ticks=0;car.lastReward=0;car.visited=new Set();car.buffer=[];car.trail=[[fresh.x,fresh.y]];car.attempts++;this.nextSpawn=this.time+.4;return true;
 }
 restartCar(id){const c=this.cars[id];if(!c)return;c.active=false;c.waiting=true;c.finished=false;c.readyAt=this.time;c.decision=null;c.buffer=[];}
 drainEvents(){return this.events.splice(0);}
 get allFinished(){return this.cars.every(c=>c.finished&&!c.waiting&&!c.active);}
 step(dt,{manualId=-1,control=E.CONTROLS.straight,epsilon=.02,repeat=true}={}){
  this.time+=dt;
  for(const car of this.cars)if(car.finished&&!car.waiting&&repeat){car.waiting=true;car.readyAt=Math.max(car.readyAt,this.time+.55);}
  if(this.time>=this.nextSpawn){const queue=this.cars.filter(c=>c.waiting&&this.time>=c.readyAt).sort((a,b)=>a.readyAt-b.readyAt||a.id-b.id);if(queue.length)this.spawn(queue[0]);}
  const beforeStates=this.states(),active=this.cars.filter(c=>c.active&&!c.state.done);
  // Observe and choose before moving any car, so each sees the same instant.
  for(const car of active){
   if(car.id===manualId){car.decision=null;car.buffer=[];continue;}
   if(!car.decision){const seen=E.sense(this.map,car.state,this.range,beforeStates);car.decision={before:car.state,observation:seen,action:this.learner.choose(seen,epsilon)};car.ticks=0;}
  }
  for(const car of active){const chosen=car.id===manualId?control:E.CONTROLS[car.decision.action];car.state=E.advanceManual(this.map,car.state,chosen,dt,this.config);car.ticks++;}
  // Crossings on different bridge decks are independent physical layers.
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
   const a=active[i],b=active[j];if(a.state.won||b.state.won||!E.sameDeck(this.map,a.state,b.state))continue;
   if(Math.hypot(a.state.x-b.state.x,a.state.y-b.state.y)<COLLISION_DISTANCE){a.state={...a.state,done:true,won:false,reason:`与 ${String(b.id+1).padStart(2,'0')} 号赛车碰撞`};b.state={...b.state,done:true,won:false,reason:`与 ${String(a.id+1).padStart(2,'0')} 号赛车碰撞`};this.collisions++;}
  }
  const afterStates=this.states();
  for(const car of active){
   const manual=car.id===manualId;
   if(!manual&&(car.ticks>=8||car.state.done)){
    const decision=car.decision,seen=E.sense(this.map,car.state,this.range,afterStates),reward=E.rewardFor(this.map,decision.before,car.state,car.visited,seen);
    this.learner.learn(decision.observation,decision.action,seen,reward,car.state.done,car.buffer);car.lastReward=reward;car.decision=null;car.ticks=0;
   }
   this.learner.observeSurvival(car.state);
   const p=car.trail.at(-1);if(!p||Math.hypot(car.state.x-p[0],car.state.y-p[1])>.06){car.trail.push([car.state.x,car.state.y]);if(car.trail.length>700)car.trail.shift();}
   if(car.state.done){
    car.active=false;car.finished=true;car.waiting=false;car.readyAt=this.time+.55;car.finishedAt=this.time;
    if(!manual)this.learner.record(car.state);car.buffer=[];
    this.events.push({id:car.id,state:{...car.state},manual});
   }
  }
 }
}
Object.assign(E,{FleetWorld,FLEET_COLLISION_DISTANCE:COLLISION_DISTANCE});
})();
