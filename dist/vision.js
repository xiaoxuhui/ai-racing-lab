/* The policy receives ray distances, speed and a goal compass, never map
   coordinates, a shortest path, waypoints or a precomputed driving script. */
(()=>{'use strict';
const E=globalThis.Racing,OFFSETS=[-105,-70,-35,0,35,70,105].map(v=>v*Math.PI/180),ACTIONS=E.ACTIONS,DT=1/15;
const controls={straight:{throttle:0,brake:0,steer:0},accelerate:{throttle:1,brake:0,steer:0},decelerate:{throttle:0,brake:1,steer:0},left:{throttle:0,brake:0,steer:-1},right:{throttle:0,brake:0,steer:1}};
const fields=new WeakMap(),RES=24,WIDTH=17*RES,HEIGHT=11*RES;
function surface(map){
 if(fields.has(map))return fields.get(map);const grid=new Uint8Array(WIDTH*HEIGHT);
 for(let j=0;j<HEIGHT;j++)for(let i=0;i<WIDTH;i++){const x=(i+.5)/RES-.5,y=(j+.5)/RES-.5;for(const[ax,ay,bx,by]of map.segments){const dx=bx-ax,dy=by-ay,t=E.clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1),ex=x-ax-t*dx,ey=y-ay-t*dy;if(ex*ex+ey*ey<=.33*.33){grid[j*WIDTH+i]=1;break;}}}
 fields.set(map,grid);return grid;
}
function sense(map,state,range=4){
 const grid=surface(map),rays=[],bridges=[...map.bridges].map(k=>k.split(',').map(Number));
 for(const offset of OFFSETS){const angle=state.angle+offset,dx=Math.cos(angle),dy=Math.sin(angle);let distance=0,hit=false,lock=state.bridgeLock;
  for(let d=.04;d<=range+.001;d+=.04){const x=state.x+dx*d,y=state.y+dy*d,i=Math.floor((x+.5)*RES),j=Math.floor((y+.5)*RES);
   let valid=i>=0&&i<WIDTH&&j>=0&&j<HEIGHT&&!!grid[j*WIDTH+i];
   if(!lock)for(const[bx,by]of bridges)if(Math.abs(x-bx)<.5&&Math.abs(y-by)<.5){lock={x:bx,y:by,axis:Math.abs(dx)>Math.abs(dy)?'h':'v'};break;}
   if(lock){if(Math.abs(x-lock.x)>.7||Math.abs(y-lock.y)>.7)lock=null;else if((lock.axis==='h'?Math.abs(y-lock.y):Math.abs(x-lock.x))>.33)valid=false;}
   if(!valid){hit=true;break;}distance=d;
  }
  if(!hit)distance=range;rays.push({offset,angle,distance,hit});
 }
 const a=Math.atan2(map.goal[1]-state.y,map.goal[0]-state.x)-state.angle;
 return {rays,range,speed:state.speed,goalBearing:Math.atan2(Math.sin(a),Math.cos(a)),goalDistance:Math.hypot(map.goal[0]-state.x,map.goal[1]-state.y)};
}
function observationKey(o){const bin=v=>v<.25?0:v<.65?1:2;return o.rays.map(r=>bin(r.distance)).join('')+':'+Math.floor((o.goalBearing+Math.PI)/(Math.PI/4))%8+':'+(o.speed<.2?0:o.speed<.8?1:o.speed<1.6?2:o.speed<3?3:4);}
function rewardFor(map,before,after,visited){
 after.idleTime=after.speed<.18?(before.idleTime||0)+(after.time-before.time):0;
 if(!after.done&&after.idleTime>=2){after.done=true;after.reason='停车过久，重新尝试';}
 if(!after.done&&after.time>=45){after.done=true;after.reason='本轮达到 45 秒，继续训练再试';}
 const old=Math.hypot(before.x-map.goal[0],before.y-map.goal[1]),dist=Math.hypot(after.x-map.goal[0],after.y-map.goal[1]);
 let reward=3*(old-dist)-.018-(after.speed<.18?.1:0);
 const cell=Math.floor(after.x*2)+','+Math.floor(after.y*2);if(!visited.has(cell)){visited.add(cell);reward+=.08;}
 if(after.done)reward+=after.won?80:after.time>=45?-5:-15;
 return reward;
}
class VisionEnvironment{
 constructor(map,config,range=4){this.map=map;this.config=config;this.range=range;this.state=E.continuousInitial(map);this.visited=new Set();}
 observe(){return sense(this.map,this.state,this.range);}
 step(action){const before=this.state;let s=before;for(let i=0;i<8&&!s.done;i++)s=E.advanceManual(this.map,s,controls[action],1/120,this.config);this.state=s;const reward=rewardFor(this.map,before,s,this.visited);return {observation:this.observe(),reward,done:s.done};}
}
class VisionLearner{
 constructor(data){this.q=data?.q||{};this.episodes=data?.episodes||0;this.results=data?.results||[];this.best=data?.best??null;this.history=data?.history||[];this.distances=data?.distances||[];this.buffer=[];this.lastReward=0;}
 values(observation){const k=observationKey(observation);return this.q[k]||(this.q[k]=[.02,0,0,0,0]);}
 choose(observation,epsilon=0){if(Math.random()<epsilon)return ACTIONS[Math.floor(Math.random()*ACTIONS.length)];const q=this.values(observation),m=Math.max(...q),choices=q.map((v,i)=>v===m?i:-1).filter(i=>i>=0);return ACTIONS[choices[Math.floor(Math.random()*choices.length)]];}
 learn(o,a,next,reward,done){
  this.lastReward=reward;const key=observationKey(o),nextKey=observationKey(next),index=ACTIONS.indexOf(a);this.values(o);this.values(next);this.buffer.push({key,index,nextKey,reward,done});if(this.buffer.length>12)this.buffer.shift();
  // Standard off-policy Q-learning, replaying recent real transitions backwards:
  // Q(s,a) += alpha * (r + gamma * max_a Q(s',a) - Q(s,a)).
  for(let i=this.buffer.length-1;i>=0;i--){const t=this.buffer[i],row=this.q[t.key],target=t.reward+(t.done?0:.98*Math.max(...this.q[t.nextKey]));row[t.index]+=.18*(target-row[t.index]);}
  if(done)this.buffer=[];
 }
 record(s){this.buffer=[];this.episodes++;this.results.push(s.won?1:0);if(this.results.length>100)this.results.shift();this.distances.push(s.distance);if(this.distances.length>100)this.distances.shift();if(s.won&&(this.best===null||s.time<this.best))this.best=s.time;if(this.episodes%20===0){this.history.push(this.results.reduce((a,b)=>a+b,0)/this.results.length);if(this.history.length>40)this.history.shift();}}
 episode(map,config,epsilon=.2,range=4){this.buffer=[];const env=new VisionEnvironment(map,config,range);let o=env.observe();while(!env.state.done){const a=this.choose(o,epsilon),r=env.step(a);this.learn(o,a,r.observation,r.reward,r.done);o=r.observation;}this.record(env.state);return env.state;}
 serialize(){return {q:this.q,episodes:this.episodes,results:this.results,best:this.best,history:this.history,distances:this.distances};}
}
Object.assign(E,{VISION_OFFSETS:OFFSETS,CONTROL_DT:DT,CONTROLS:controls,sense,observationKey,rewardFor,VisionEnvironment,VisionLearner});
})();
