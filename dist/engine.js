/* Discrete, tabular Q-learning. No path is supplied to the policy. */
(function(root){
 'use strict';
 const DIRS=[[1,0],[0,1],[-1,0],[0,-1]], SPEEDS=[.5,1,2,3], ACTIONS=['straight','accelerate','decelerate','left','right'];
 const key=(x,y)=>`${x},${y}`;
 function makeMap(index){
  const roads=new Set(), segments=[], bridges=new Set();
  function line(x1,y1,x2,y2){segments.push([x1,y1,x2,y2]);const dx=Math.sign(x2-x1),dy=Math.sign(y2-y1);let x=x1,y=y1;roads.add(key(x,y));while(x!==x2||y!==y2){x+=dx;y+=dy;roads.add(key(x,y));}}
  if(index===0){line(0,8,14,8);line(4,8,4,5);line(4,5,14,5);line(12,5,12,2);line(6,2,16,2);line(6,1,6,9);line(14,5,14,8);bridges.add('6,5');}
  if(index===1){line(0,8,12,8);line(3,8,3,2);line(3,2,16,2);line(8,1,8,9);line(3,5,14,5);line(12,2,12,8);line(14,5,14,9);}
  if(index===2){line(0,8,14,8);line(2,8,2,2);line(2,2,16,2);line(14,2,14,8);line(2,5,14,5);line(9,2,9,8);bridges.add('9,5');}
  const map={index,roads,segments,bridges,start:[0,8],goal:[16,2]};
  // A directional graph accounts for the non-connecting bridge decks.
  const reverse=new Map();
  for(const pos of roads){const [x,y]=pos.split(',').map(Number);for(let d=0;d<4;d++){const from=`${x},${y},${d}`;for(const nd of [d,(d+1)%4,(d+3)%4]){if(bridges.has(pos)&&nd!==d)continue;const nx=x+DIRS[nd][0],ny=y+DIRS[nd][1];if(!roads.has(key(nx,ny)))continue;const to=`${nx},${ny},${nd}`;if(!reverse.has(to))reverse.set(to,[]);reverse.get(to).push(from);}}}
  map.dist=new Map();const queue=[];for(let d=0;d<4;d++){const k=`16,2,${d}`;map.dist.set(k,0);queue.push(k);}for(let i=0;i<queue.length;i++){const k=queue[i];for(const p of reverse.get(k)||[]){if(!map.dist.has(p)){map.dist.set(p,map.dist.get(k)+1);queue.push(p);}}}
  return map;
 }
 function initial(){return {x:0,y:8,d:0,v:1,steps:0,time:0,done:false,won:false,reason:'',action:'straight'};}
 function stateKey(s){return `${s.x},${s.y},${s.d},${s.v}`;}
 function transition(map,s,a){
  if(s.done)return {state:{...s},reward:0};
  const n={...s,steps:s.steps+1,action:a};
  if(a==='accelerate')n.v=Math.min(3,s.v+1);if(a==='decelerate')n.v=Math.max(0,s.v-1);
  const turn=a==='left'||a==='right';
  // The elapsed interval was driven at the previous speed. The chosen action
  // sets the speed for the next interval, matching the visible simulation.
  n.time+=1/SPEEDS[s.v];
  if(turn&&SPEEDS[n.v]>1){n.done=true;n.reason='转弯速度过快';return {state:n,reward:-35};}
  if(turn&&map.bridges.has(key(s.x,s.y))){n.done=true;n.reason='高架交汇处不能转弯';return {state:n,reward:-35};}
  if(a==='left')n.d=(n.d+3)%4;if(a==='right')n.d=(n.d+1)%4;
  n.x+=DIRS[n.d][0];n.y+=DIRS[n.d][1];
  if(!map.roads.has(key(n.x,n.y))){n.done=true;n.reason='驶出道路';return {state:n,reward:-35};}
  if(n.x===map.goal[0]&&n.y===map.goal[1]){n.done=true;n.won=true;n.reason='成功抵达出口';return {state:n,reward:120};}
  if(n.steps>=180){n.done=true;n.reason='本轮达到 180 步上限';return {state:n,reward:-20};}
  const before=map.dist.get(`${s.x},${s.y},${s.d}`)??50,after=map.dist.get(`${n.x},${n.y},${n.d}`)??50;
  return {state:n,reward:1.4*(before-after)-.15-.22/SPEEDS[s.v]};
 }
 class Learner{
  constructor(map,data){this.map=map;this.q=data?.q||{};this.episodes=data?.episodes||0;this.results=data?.results||[];this.best=data?.best??null;this.history=data?.history||[];}
  values(s){const k=stateKey(s);return this.q[k]||(this.q[k]=[0,0,0,0,0]);}
  choose(s,epsilon=0){if(Math.random()<epsilon)return ACTIONS[Math.floor(Math.random()*5)];const q=this.values(s),max=Math.max(...q),ties=q.map((v,i)=>v===max?i:-1).filter(i=>i>=0);return ACTIONS[ties[Math.floor(Math.random()*ties.length)]];}
  learn(s,a,n,reward){const q=this.values(s),i=ACTIONS.indexOf(a);q[i]+=.22*(reward+(n.done?0:.97*Math.max(...this.values(n)))-q[i]);}
  record(s){this.episodes++;this.results.push(s.won?1:0);if(this.results.length>100)this.results.shift();if(s.won&&(this.best===null||s.time<this.best))this.best=s.time;if(this.episodes%20===0){this.history.push(this.results.reduce((a,b)=>a+b,0)/this.results.length);if(this.history.length>40)this.history.shift();}}
  episode(epsilon){let s=initial();while(!s.done){const a=this.choose(s,epsilon),r=transition(this.map,s,a);this.learn(s,a,r.state,r.reward);s=r.state;}this.record(s);return s;}
  serialize(){return {q:this.q,episodes:this.episodes,results:this.results,best:this.best,history:this.history};}
 }
 const api={DIRS,SPEEDS,ACTIONS,key,makeMap,initial,stateKey,transition,Learner};root.Racing=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
