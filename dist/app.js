(()=>{'use strict';
const $=id=>document.getElementById(id),E=Racing,NS='http://www.w3.org/2000/svg';
const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}};
const memory=new Map();
let config={color:'#d5ed99',style:'sport',maxSpeed:8,acceleration:2,steering:3,...read('apex-car-v2',{})};
let mapIndex=0,map,learner,state,mode='ai',running=false,training=false,editing=false,tool='road',draft=null,undo=[],editOrigin=0,paintPointer=null,lastCell=null,paintChanged=false,strokePainted=new Set();
let routeVisible=false,trail=[],last=0,accumulator=0,toastTimer,storageAvailable=true,held=new Set(),pointers=new Map(),keys=new Set(),repeatDelay=0,renderClock=0;
let observation=null,decision=null,decisionTicks=0,visited=new Set(),showVision=true,visionRange=4;
const physicalKeys=new Set();
function persist(k,v){memory.set(k,v);try{localStorage.setItem(k,JSON.stringify(v));}catch{if(storageAvailable){storageAvailable=false;toast('存储不可用，设置暂时保留在本次页面中。');}}}
function load(k,fallback=null){return memory.has(k)?memory.get(k):read(k,fallback);}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function save(){if(learner)persist('apex-vision-v3-'+mapIndex,learner.serialize());}
function init(index){mapIndex=index;persist('apex-selected-map-v1',index);map=E.makeMap(index,index===3?load('apex-custom-track-v2'):null);learner=new E.VisionLearner(load('apex-vision-v3-'+index));$('mapSelect').value=index;reset();drawMap();stats();}
function clearHeld(){held.clear();keys.clear();physicalKeys.clear();pointers.clear();document.querySelectorAll('[data-action]').forEach(b=>{b.classList.remove('pressed');b.setAttribute('aria-pressed','false');});}
function reset(resume=false){running=resume&&!E.mapIssue(map);repeatDelay=0;accumulator=0;decision=null;decisionTicks=0;visited=new Set();learner.buffer=[];clearHeld();state=map.start&&map.goal?E.continuousInitial(map):null;observation=state?E.sense(map,state,visionRange):null;trail=state?[[state.x,state.y]]:[];$('result').classList.add('hidden');drawDynamic();update();}
function ready(){const issue=E.mapIssue(map);if(issue){toast(issue+'，点「编辑 / 擦除」继续修改。');return false;}return true;}
function mapViewSize(){return {width:map.width*48+34,height:map.height*46+44};}
function svg(tag,attrs={},parent){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(parent)parent.appendChild(n);return n;}
function label(parent,x,y,text,attrs={}){const n=svg('text',{x,y,'font-family':'DM Sans, Microsoft YaHei, sans-serif',...attrs},parent);n.textContent=text;return n;}
function point(x,y){return [41+x*48,39+y*46];}
function pathFor(points){return points.map((p,i)=>`${i?'L':'M'}${point(...p).join(' ')}`).join(' ');}

function drawMap(){
 const t=$('track'),view=mapViewSize();t.replaceChildren();t.setAttribute('viewBox',`0 0 ${view.width} ${view.height}`);t.style.aspectRatio=view.width+' / '+view.height;$('mapInfo').textContent=`${map.width} × ${map.height} · 连续运动 · 北 ↑`;
 const defs=svg('defs',{},t),grid=svg('pattern',{id:'grid',width:48,height:46,patternUnits:'userSpaceOnUse',x:17,y:16},defs);svg('path',{d:'M48 0H0V46',fill:'none',stroke:'#d4dcc8','stroke-width':.6,'stroke-opacity':.6},grid);
 const shadow=svg('filter',{id:'carShadow',x:'-80%',y:'-80%',width:'260%',height:'260%'},defs);svg('feDropShadow',{dx:0,dy:3,stdDeviation:3,'flood-color':'#172e20','flood-opacity':.3},shadow);
 const pattern=svg('pattern',{id:'checker',width:10,height:10,patternUnits:'userSpaceOnUse'},defs);svg('rect',{width:10,height:10,fill:'#f3f5eb'},pattern);svg('path',{d:'M0 0h5v5H0zM5 5h5v5H5z',fill:'#64745c'},pattern);
 svg('rect',{width:view.width,height:view.height,fill:'url(#grid)'},t);
 // Quiet landscape blocks, deliberately kept away from the road network.
 const scenery=svg('g',{},t);
 for(let y=1;y<map.height-1;y++){for(let x=1;x<map.width-1;x++){if(map.roads.has(E.key(x,y))||map.roads.has(E.key(x+1,y))||map.roads.has(E.key(x,y+1)))continue;const [px,py]=point(x,y),seed=(x*23+y*41)%17;if(seed<4){svg('rect',{x:px-14,y:py-13,width:29,height:26,rx:4,fill:'#d8dfcc',stroke:'#cdd6bf','stroke-width':1},scenery);svg('path',{d:`M${px-8} ${py-6}h16m-16 6h16m-16 6h16`,stroke:'#c7d1bb','stroke-width':1},scenery);}else if(seed<10){svg('circle',{cx:px+3,cy:py+3,r:9,fill:'#d5dec5'},scenery);svg('circle',{cx:px,cy:py,r:8,fill:'#c1d0ad'},scenery);svg('circle',{cx:px-2,cy:py-2,r:4,fill:'#cad7ba'},scenery);}}}
 const roads=svg('g',{'stroke-linecap':'round','stroke-linejoin':'round',fill:'none'},t);
 for(const [color,width]of [['#c1cbb2',38],['#7d8c71',32]])for(const seg of map.segments)svg('path',{d:pathFor([[seg[0],seg[1]],[seg[2],seg[3]]]),stroke:color,'stroke-width':width},roads);
 for(const seg of map.segments)if(seg[0]!==seg[2]||seg[1]!==seg[3])svg('path',{d:pathFor([[seg[0],seg[1]],[seg[2],seg[3]]]),stroke:'#b7c3a5','stroke-width':1.4,'stroke-dasharray':'5 8'},roads);
 for(const k of map.roads){const[x,y]=k.split(',').map(Number);if(map.bridges.has(k))continue;let count=0;for(const [dx,dy]of E.DIRS)if(map.edges.has(E.edgeKey(k,E.key(x+dx,y+dy))))count++;if(count>=3){const [cx,cy]=point(x,y);svg('rect',{x:cx-15,y:cy-15,width:30,height:30,rx:2,fill:'#879779'},t);svg('rect',{x:cx-10,y:cy-10,width:20,height:20,rx:1,fill:'none',stroke:'#acba98','stroke-width':.8,'stroke-dasharray':'3 3'},t);}}
 const routeLayer=svg('g',{id:'routeLayer'},t);
 const bridgeLayer=svg('g',{},t);
 for(const k of map.bridges){const[x,y]=k.split(',').map(Number),[cx,cy]=point(x,y);svg('rect',{x:cx-57,y:cy-19,width:114,height:42,rx:3,fill:'#4f6346',opacity:.27},bridgeLayer);svg('rect',{x:cx-60,y:cy-17,width:120,height:34,rx:2,fill:'#93a081'},bridgeLayer);svg('path',{d:`M${cx-59} ${cy-17}h118 M${cx-59} ${cy+17}h118`,stroke:'#c8d2b7','stroke-width':4},bridgeLayer);svg('path',{d:`M${cx-58} ${cy}h116`,stroke:'#d5dfc1','stroke-width':1.3,'stroke-dasharray':'5 8'},bridgeLayer);label(t,cx-37,cy-29,'高架桥 · 上层',{fill:'#7b8c67','font-size':8,'letter-spacing':.6});}
 if(map.start){const[sx,sy]=point(...map.start),g=svg('g',{'data-marker':'start'},t);svg('rect',{x:sx-17,y:sy-17,width:34,height:34,rx:7,fill:'#d9edb1',stroke:'#aac783','stroke-width':1.5},g);label(g,sx,sy+4,['→','↓','←','↑'][map.startDir],{fill:'#5a7c39','font-size':18,'text-anchor':'middle'});label(g,sx-14,sy+36,'入口',{fill:'#718958','font-size':9});}
 if(map.goal){const[gx,gy]=point(...map.goal),g=svg('g',{'data-marker':'goal'},t);svg('rect',{x:gx-11,y:gy-17,width:23,height:34,rx:1,fill:'url(#checker)',stroke:'#8b9d77','stroke-width':1},g);label(g,gx-10,gy-29,'出口',{fill:'#697e56','font-size':9});}
 label(t,78,77,'APEX TESTING GROUNDS',{'font-size':9,fill:'#a3af94','letter-spacing':2});label(t,78,92,['OVERPASS CIRCUIT','URBAN CROSSROADS','THE LOOP','YOUR OWN CIRCUIT'][mapIndex],{'font-size':7,fill:'#b0baa3','letter-spacing':1.7});
 const compass=svg('g',{transform:`translate(${view.width-75} ${view.height-85})`},t);svg('circle',{r:20,fill:'none',stroke:'#cbd5be'},compass);svg('path',{d:'M0 -12L5 7L0 4L-5 7Z',fill:'#98a989'},compass);label(compass,0,-27,'N',{'text-anchor':'middle',fill:'#8b9e77','font-size':8});
 svg('g',{id:'trailLayer'},t);svg('g',{id:'visionLayer','pointer-events':'none'},t);svg('g',{id:'carLayer'},t);if(editing)drawEditorGrid(t);drawReference();drawDynamic();
}
function drawReference(){const layer=$('routeLayer');if(!layer)return;layer.replaceChildren();if(!routeVisible||editing||E.mapIssue(map))return;const path=E.smoothPath(E.reference(map));if(path.length)svg('path',{d:pathFor(path.map(p=>[p.x,p.y])),fill:'none',stroke:'#dceeb3','stroke-width':3,'stroke-linecap':'round','stroke-dasharray':'2 7',opacity:.8},layer);}
function drawEditorGrid(t){const g=svg('g',{'pointer-events':'none','data-editor-grid':'true'},t);for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){const[cx,cy]=point(x,y);svg('rect',{x:cx-23.5,y:cy-22.5,width:47,height:45,fill:'transparent',stroke:'#b5c79c','stroke-width':.7,'stroke-dasharray':'2 4',opacity:.65},g);}}
function drawDynamic(){
 const layer=$('carLayer'),tl=$('trailLayer');if(!layer)return;
 if(editing||!state){layer.replaceChildren();tl.replaceChildren();$('visionLayer')?.replaceChildren();if(!editing)drawVision();return;}
 let car=layer.firstElementChild;
 if(!car){car=svg('g',{filter:'url(#carShadow)',class:'road-car'},layer);
  svg('ellipse',{rx:25,ry:23,fill:'#dcf3a2',opacity:.13},car);svg('rect',{x:-13,y:-12,width:8,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:-13,y:7,width:8,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:7,y:-12,width:7,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:7,y:7,width:7,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:-17,y:-9,width:34,height:config.style==='formula'?14:18,rx:config.style==='buggy'?2:6,fill:config.color,stroke:'#f0ffcd','stroke-width':1.2},car);svg('path',{d:'M-2 -7L7 -6L9 0L7 6L-2 7Z',fill:'#55774a'},car);svg('path',{d:'M-12 -6h5v12h-5z',fill:'#a6c77c'},car);svg('path',{d:'M14 -6v3M14 3v3',stroke:'#f9ffe7','stroke-width':2},car);svg('path',{d:'M-15 -5v3M-15 3v3',stroke:'#bf9964','stroke-width':2},car);
 if(config.style==='formula'){svg('rect',{x:-20,y:-13,width:4,height:26,rx:1,fill:config.color},car);svg('rect',{x:15,y:-13,width:4,height:26,rx:1,fill:config.color},car);}
 if(config.style==='buggy')svg('path',{d:'M-8 -9v18M1 -9v18M-8 0h9',stroke:'#3d5337','stroke-width':2},car);
 }
 const[x,y]=point(state.x,state.y);car.setAttribute('transform',`translate(${x} ${y}) rotate(${state.angle*180/Math.PI}) scale(.73)`);car.classList.toggle('crashed',state.done&&!state.won);
 let under=false;for(const k of map.bridges){const[bx,by]=k.split(',').map(Number);if(Math.abs(state.x-bx)<.36&&Math.abs(state.y-by)<.32&&Math.abs(Math.sin(state.angle))>.7)under=true;}car.setAttribute('opacity',under?.32:1);
 const p=trail[trail.length-1];if(!p||Math.hypot(state.x-p[0],state.y-p[1])>.055){trail.push([state.x,state.y]);if(trail.length>1000)trail.shift();}
 if(!tl.firstElementChild)svg('path',{fill:'none',stroke:'#dbed9c','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.85},tl);
 tl.firstElementChild.setAttribute('d',pathFor(trail));drawVision();
}
function drawVision(){
 const layer=$('visionLayer');if(!layer||editing)return;layer.replaceChildren();
 if(!state){$('sensorReadings').replaceChildren();$('qValues').replaceChildren();$('goalBearing').textContent='—';$('visionState').textContent='请先放置入口和出口';$('knownStates').textContent=Object.keys(learner.q).length.toLocaleString();return;}
 observation=E.sense(map,state,visionRange);const o=observation,[cx,cy]=point(state.x,state.y);
 if(showVision){
  const ends=o.rays.map(r=>point(state.x+Math.cos(r.angle)*r.distance,state.y+Math.sin(r.angle)*r.distance)),fan='M'+cx+' '+cy+' '+ends.map(p=>'L'+p.join(' ')).join(' ')+' Z';svg('path',{d:fan,fill:'#b8e879',opacity:.13},layer);
  for(let i=0;i<o.rays.length;i++){const r=o.rays[i],[x,y]=ends[i],color=r.distance<.3?'#e98365':r.distance<.7?'#d8b45e':'#a9d975';svg('line',{x1:cx,y1:cy,x2:x,y2:y,stroke:color,'stroke-width':i===3?1.6:1,'stroke-opacity':.8},layer);svg('circle',{cx:x,cy:y,r:i===3?2.8:2,fill:color},layer);}
  const a=state.angle+o.goalBearing,gx=cx+Math.cos(a)*23,gy=cy+Math.sin(a)*23;svg('path',{d:`M${cx} ${cy}L${gx} ${gy}`,stroke:'#81bfed','stroke-width':1.6,'stroke-dasharray':'2 2'},layer);
 }
 const readings=$('sensorReadings');readings.replaceChildren();
 const names=['左后','左侧','左前','正前','右前','右侧','右后'];
 o.rays.forEach((r,i)=>{const el=document.createElement('div');el.className='sensor-reading';const title=document.createElement('span');title.textContent=names[i];const meter=document.createElement('i');meter.style.setProperty('--distance',Math.max(2,r.distance/visionRange*100)+'%');meter.style.setProperty('--ray',r.distance<.3?'#d98b71':r.distance<.7?'#c3aa6e':'#92b96b');const value=document.createElement('b');value.textContent=r.distance.toFixed(2);el.append(title,meter,value);readings.append(el);});
 $('goalBearing').textContent=(o.goalBearing*180/Math.PI).toFixed(0)+'°';$('visionState').textContent=E.observationKey(o);
 const qs=learner.q[E.observationKey(o)]||[0,0,0,0,0],best=Math.max(...qs),scale=Math.max(1,...qs.map(Math.abs));
 $('qValues').replaceChildren();E.ACTIONS.forEach((a,i)=>{const el=document.createElement('div');el.className='q-row'+(qs[i]===best?' best':'');const name=document.createElement('span');name.textContent={straight:'直行',accelerate:'加速',decelerate:'减速',left:'左转',right:'右转'}[a];const bar=document.createElement('i');bar.style.width=(8+Math.abs(qs[i])/scale*52)+'%';const value=document.createElement('b');value.textContent=qs[i].toFixed(2);el.append(name,bar,value);$('qValues').append(el);});
 $('rewardValue').textContent=learner.lastReward.toFixed(2);$('knownStates').textContent=Object.keys(learner.q).length.toLocaleString();
}
const actionNames={straight:['直行','→'],accelerate:['持续加速','↑'],decelerate:['持续减速','↓'],left:['持续左转','↰'],right:['持续右转','↱']};
function update(){
 $('aiMode').classList.toggle('active',mode==='ai');$('manualMode').classList.toggle('active',mode==='manual');$('aiMode').setAttribute('aria-pressed',mode==='ai');$('manualMode').setAttribute('aria-pressed',mode==='manual');
 const issue=E.mapIssue(map);$('trackNotice').classList.toggle('hidden',editing||!issue);$('trackIssue').textContent=issue;
 $('start').disabled=training||editing||!!issue;$('train').disabled=editing||!!issue;$('routeToggle').disabled=editing||!!issue;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=training||editing||!!issue);
 if(!state){$('speed').innerHTML='— <small>格 / 秒</small>';$('elapsed').textContent='00:00.0';$('steps').innerHTML='0.00 <small>格</small>';$('action').textContent='等待设置';$('runStatus').textContent=editing?'正在编辑赛道':issue;$('coordinates').textContent='地图草稿 · '+map.width+' × '+map.height;$('start').textContent='请先补齐赛道';return;}$('speed').innerHTML=state.speed.toFixed(2)+' <small>格 / 秒</small>';
 const sec=state.time;$('elapsed').innerHTML=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(Math.floor(sec%60)).padStart(2,'0')+'<small>.'+Math.floor((sec%1)*10)+'</small>';
 $('steps').innerHTML=state.distance.toFixed(2)+' <small>格</small>';
 const an=actionNames[state.action]||actionNames.straight;$('action').innerHTML=(state.time?an[0]:'等待指令')+' <span>'+an[1]+'</span>';
 $('start').innerHTML=running?'Ⅱ 暂停驾驶':state.done?'↺ 再跑一轮':'<span>▶</span> '+(state.time?'继续驾驶':'开始驾驶');
 $('runStatus').textContent=editing?'正在编辑赛道':training?'AI 正在学习':state.done?state.reason:running?'连续行驶中':state.time?'已暂停':'等待出发';
 $('coordinates').textContent=`位置 (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) · 朝向 ${((state.angle*180/Math.PI%360+360)%360).toFixed(0)}°`;
 $('modeTitle').textContent=mode==='ai'?'训练你的赛车':'接管方向盘';
 $('modeDesc').textContent=mode==='ai'?'读取 7 条探测射线、车速和出口方位，用 Q 值选择油门、刹车与转向。需要反复试错，训练后也可能撞车。':'按住 WASD 或方向键持续控制，可同时加速和转向。松开后保持车速与方向。';
 $('actionHint').textContent=held.size?'正在持续执行：'+[...held].map(a=>actionNames[a][0]).join(' + '):'按住连续生效，松开恢复匀速直行。转弯不限速。';
}
function stats(){
 const n=learner.episodes;$('episodes').innerHTML=n.toLocaleString()+' <small>轮</small>';const rate=learner.results.length?Math.round(100*learner.results.reduce((a,b)=>a+b,0)/learner.results.length):null;$('successRate').innerHTML=(rate??'—')+' <small>%</small>';$('bestTime').innerHTML=(learner.best===null?'—':learner.best.toFixed(1))+' <small>秒</small>';$('policyStatus').textContent=n?'已学习 '+n.toLocaleString()+' 轮':'尚未训练';
 const distances=learner.distances,average=distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:0;$('learningNote').innerHTML=n?'最近 '+distances.length+' 轮平均行驶 '+average.toFixed(2)+' 格。<br><span>已学习 '+n.toLocaleString()+' 轮，继续观察与训练。</span>':'从射线距离开始积累驾驶经验。<br><span>先训练，再观察 Q 值怎样影响动作。</span>';
 const h=learner.history,sl=$('sparkline');sl.replaceChildren();if(h.length>1){const d=h.map((v,i)=>`${i?'L':'M'}${(i/(h.length-1)*108+2).toFixed(1)},${(36-v*30).toFixed(1)}`).join(' ');svg('path',{d:d+' L110 40 L2 40Z',fill:'#eff5e4'},sl);svg('path',{d,fill:'none',stroke:'#97b66b','stroke-width':1.7},sl);}drawVision();
}

function finish(won,reason){
 if(state.done)return;state.done=true;state.won=won;state.reason=reason;repeatDelay=.65;
 if(mode==='ai'){learner.record(state);save();stats();}
 $('result').classList.remove('hidden');$('result').innerHTML=(won?'⚑ 成功抵达出口！':'↺ '+reason)+'<small>'+state.distance.toFixed(2)+' 格 · '+state.time.toFixed(1)+' 秒'+($('autoRepeat').checked?' · 即将自动开始下一轮':' · 可重置后继续')+'</small>';
 if(!$('autoRepeat').checked)running=false;clearHeld();update();
}
function advance(dt){
 if(mode==='manual'){
  const next=E.advanceManual(map,state,{throttle:held.has('accelerate')?1:0,brake:held.has('decelerate')?1:0,steer:(held.has('right')?1:0)-(held.has('left')?1:0)},dt,config);
  const done=next.done;state=next;if(done){state.done=false;finish(next.won,next.reason);}return;
 }
 if(!decision){const seen=E.sense(map,state,visionRange);decision={before:state,observation:seen,action:learner.choose(seen,.02)};decisionTicks=0;}
 state=E.advanceManual(map,state,E.CONTROLS[decision.action],dt,config);decisionTicks++;
 if(decisionTicks>=8||state.done){const reward=E.rewardFor(map,decision.before,state,visited),seen=E.sense(map,state,visionRange);learner.learn(decision.observation,decision.action,seen,reward,state.done);decision=null;decisionTicks=0;}
 if(state.done){const won=state.won,reason=state.reason;state.done=false;finish(won,reason);}
}
function frame(now){
 const elapsed=last?Math.min((now-last)/1000,.15):0;last=now;
 if(running&&!training&&!editing){
  if(state.done){repeatDelay-=elapsed;if(repeatDelay<=0){if($('autoRepeat').checked)reset(true);else{running=false;update();}}}
  else{accumulator+=elapsed;while(accumulator>=1/120&&!state.done){advance(1/120);accumulator-=1/120;}}
  drawDynamic();renderClock+=elapsed;if(renderClock>.06){renderClock=0;update();}
 }
 requestAnimationFrame(frame);
}
function start(){if(training||editing||!ready())return;if(state.done)reset();running=!running;accumulator=0;clearHeld();update();}
function setMode(next){if(training||editing||mode===next)return;mode=next;if(next==='ai'){reset(running);toast('已切换视野 AI，从入口开始观察和驾驶。');}else{decision=null;learner.buffer=[];clearHeld();update();}}
function refreshHeld(){held=new Set([...keys,...pointers.values()]);document.querySelectorAll('[data-action]').forEach(b=>{const on=held.has(b.dataset.action);b.classList.toggle('pressed',on);b.setAttribute('aria-pressed',on);});update();}
function takeControl(){if(training||editing||!ready())return false;if(state.done)reset();if(mode==='ai'){mode='manual';decision=null;learner.buffer=[];}running=true;update();return true;}
function locked(v){for(const id of ['mapSelect','start','reset','clearTraining','editTrack','aiMode','manualMode'])$(id).disabled=v;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=v);}
async function train(){
 if(training){training=false;return;}if(editing||!ready())return;running=false;clearHeld();training=true;locked(true);$('trainingProgress').classList.remove('hidden');$('train').textContent='Ⅱ 停止训练';let count=0;const epsilon=Number($('exploration').value)/100;update();
 try{while(count<5000&&training){const start=performance.now();do{learner.episode(map,config,Math.max(.03,epsilon/(1+learner.episodes/2000)),visionRange);count++;}while(count<5000&&performance.now()-start<12);$('progressBar').style.width=count/50+'%';$('progressText').textContent=`已训练 ${count.toLocaleString()} / 5,000 轮`;stats();await new Promise(r=>setTimeout(r,0));}}
 finally{training=false;locked(false);$('train').innerHTML='✧ 训练 5,000 轮 <span>→</span>';save();reset();stats();toast(`完成 ${count.toLocaleString()} 轮视野驾驶训练，可继续训练或观察驾驶。`);setTimeout(()=>$('trainingProgress').classList.add('hidden'),1800);}
}
function beginEditor(){
 if(training)return;save();running=false;clearHeld();editing=true;editOrigin=mapIndex;draft=E.serializeMap(map);undo=[];paintPointer=null;
 $('editor').classList.remove('hidden');document.querySelector('.track-panel').classList.add('editing');syncEditorFields();$('mapSelect').disabled=true;$('start').disabled=true;$('train').disabled=true;$('editTrack').disabled=true;$('clearTraining').disabled=true;$('reset').disabled=true;drawMap();update();
}
function syncEditorFields(){$('entryDirection').value=draft.startDir;$('mapWidth').value=draft.width;$('mapHeight').value=draft.height;}
function rebuildDraft(){map=E.makeMap(3,draft);syncEditorFields();drawMap();update();}
function endEditor(saveChanges){
 if(!editing)return;
 if(saveChanges){
  if(!applyDraftSize())return;
  persist('apex-custom-track-v2',draft);persist('apex-vision-v3-3',null);
 }
 editing=false;paintPointer=null;draft=null;undo=[];$('editor').classList.add('hidden');document.querySelector('.track-panel').classList.remove('editing');locked(false);$('train').disabled=false;init(saveChanges?3:editOrigin);if(saveChanges)toast(E.mapIssue(map)?'地图草稿已保存；补齐入口、出口和道路后即可驾驶。':'自定义赛道已保存，可以开始驾驶或训练。');
}
function gridCell(e){const t=$('track'),matrix=t.getScreenCTM();if(!matrix)return null;const p=t.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const local=p.matrixTransform(matrix.inverse()),x=Math.round((local.x-41)/48),y=Math.round((local.y-39)/46);return x>=0&&x<map.width&&y>=0&&y<map.height?[x,y]:null;}
function paintCell(x,y){
 const k=E.key(x,y),roads=new Set(draft.roads),bridges=new Set(draft.bridges),edges=new Set(draft.edges);
 if(tool==='erase'&&strokePainted.has(k))return;if(tool==='erase')strokePainted.add(k);
 if(tool==='road')roads.add(k);else if(tool==='erase'){const start=draft.start&&E.key(...draft.start)===k,goal=draft.goal&&E.key(...draft.goal)===k;if(start)draft.start=null;if(goal)draft.goal=null;if(!start&&!goal){roads.delete(k);bridges.delete(k);}}else if(tool==='bridge'){roads.add(k);bridges.add(k);}else if(tool==='start'){roads.add(k);draft.start=[x,y];}else if(tool==='goal'){roads.add(k);draft.goal=[x,y];}
 if(!roads.has(k))for(const e of edges)if(e.split('|').includes(k))edges.delete(e);
 if(tool==='road'&&$('autoConnect').checked)for(const[dx,dy]of E.DIRS){const other=E.key(x+dx,y+dy);if(roads.has(other))edges.add(E.edgeKey(k,other));}
 draft.roads=[...roads];draft.bridges=[...bridges];draft.edges=[...edges];
}
function paintStep(from,to){paintCell(...to);if(tool==='road'){const edges=new Set(draft.edges);edges.add(E.edgeKey(E.key(...from),E.key(...to)));draft.edges=[...edges];}}
function paint(e){
 const cell=gridCell(e);if(!cell)return;if(lastCell&&lastCell[0]===cell[0]&&lastCell[1]===cell[1])return;
 if(lastCell&&(tool==='road'||tool==='erase')){let[x,y]=lastCell;const dx=Math.abs(cell[0]-x),dy=Math.abs(cell[1]-y),sx=Math.sign(cell[0]-x),sy=Math.sign(cell[1]-y);let err=dx-dy;while(x!==cell[0]||y!==cell[1]){const e2=err*2;if(e2>-dy){err-=dy;const from=[x,y];x+=sx;paintStep(from,[x,y]);}if(e2<dx){err+=dx;const from=[x,y];y+=sy;paintStep(from,[x,y]);}}}
 paintCell(...cell);lastCell=cell;paintChanged=true;rebuildDraft();
}
$('track').addEventListener('pointerdown',e=>{if(!editing||e.button>0)return;e.preventDefault();paintPointer=e.pointerId;lastCell=null;paintChanged=false;strokePainted=new Set();undo.push(JSON.stringify(draft));if(undo.length>40)undo.shift();$('track').setPointerCapture(e.pointerId);paint(e);});
$('track').addEventListener('pointermove',e=>{if(editing&&paintPointer===e.pointerId){e.preventDefault();paint(e);}});
function endPaint(e){if(e.pointerId===paintPointer){paintPointer=null;lastCell=null;if(!paintChanged)undo.pop();}}
$('track').addEventListener('pointerup',endPaint);$('track').addEventListener('pointercancel',endPaint);
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('selected',x===b));$('editorHint').textContent=tool==='erase'?'点入口或出口会先擦掉标记、保留道路，再擦一次删除道路。支持撤销。':tool==='bridge'?'点击十字交叉处放置高架，上下道路互不连通。':tool==='start'?'点击任意格子放置或移动入口，旧入口会自动移走。':tool==='goal'?'点击任意格子放置或移动出口，旧出口会自动移走。':'拖动绘制道路；地图不完整也可以保存草稿。';});
$('entryDirection').onchange=e=>{undo.push(JSON.stringify(draft));draft.startDir=Number(e.target.value);rebuildDraft();};$('undoEdit').onclick=()=>{if(undo.length){draft=JSON.parse(undo.pop());$('entryDirection').value=draft.startDir;rebuildDraft();}};
$('editTrack').onclick=beginEditor;$('saveTrack').onclick=()=>endEditor(true);$('cancelEdit').onclick=()=>endEditor(false);
$('fixMap').onclick=beginEditor;
function applyDraftSize(){if(!editing)return false;if(!$('mapWidth').reportValidity()||!$('mapHeight').reportValidity())return false;const width=Number($('mapWidth').value),height=Number($('mapHeight').value);if(width===draft.width&&height===draft.height)return true;undo.push(JSON.stringify(draft));draft=E.resizeMap(draft,width,height);rebuildDraft();$('editorHint').textContent=`已调整为 ${draft.width} 列 × ${draft.height} 行；边界外的内容已裁掉，可撤销恢复。`;return true;}
$('applySize').onclick=applyDraftSize;
for(const [id,field]of [['removeStart','start'],['removeGoal','goal']])$(id).onclick=()=>{if(!editing||!draft[field])return;undo.push(JSON.stringify(draft));draft[field]=null;rebuildDraft();$('editorHint').textContent=field==='start'?'入口已擦除。选择「入口」后点击新位置，或先保存草稿。':'出口已擦除。选择「出口」后点击新位置，或先保存草稿。';};
$('start').onclick=start;$('reset').onclick=()=>{if(!training&&!editing)reset();};$('train').onclick=train;
$('aiMode').onclick=()=>setMode('ai');$('manualMode').onclick=()=>setMode('manual');
document.querySelectorAll('[data-action]').forEach(b=>{
 b.addEventListener('pointerdown',e=>{if(e.button>0||!takeControl())return;e.preventDefault();b.setPointerCapture(e.pointerId);pointers.set(e.pointerId,b.dataset.action);refreshHeld();});
 const release=e=>{pointers.delete(e.pointerId);refreshHeld();};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
 b.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();if(takeControl()){keys.add(b.dataset.action);refreshHeld();}}});
 b.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();keys.delete(b.dataset.action);refreshHeld();}});
});
const keyActions={w:'accelerate',s:'decelerate',a:'left',d:'right',arrowup:'accelerate',arrowdown:'decelerate',arrowleft:'left',arrowright:'right'};
window.addEventListener('keydown',e=>{
 if($('helpDialog').open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();
 if(keyActions[k]){e.preventDefault();if(e.repeat||!takeControl())return;physicalKeys.add(k);keys=new Set([...physicalKeys].map(k=>keyActions[k]));refreshHeld();}
 else if(k===' '&&!e.repeat&&e.target.tagName!=='BUTTON'){e.preventDefault();start();}else if(k==='r'&&!e.repeat&&!editing&&!training)reset();
});
window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(keyActions[k]){physicalKeys.delete(k);keys=new Set([...physicalKeys].map(k=>keyActions[k]));refreshHeld();}});
function releaseAll(){clearHeld();if(running){running=false;update();}}
window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});
$('exploration').oninput=e=>$('exploreValue').textContent=e.target.value+'%';$('mapSelect').onchange=e=>{save();init(Number(e.target.value));toast('已切换赛道。');};
$('routeToggle').onclick=()=>{routeVisible=!routeVisible;$('routeToggle').setAttribute('aria-pressed',routeVisible);drawReference();};
$('clearTraining').onclick=()=>{if(training||editing)return;learner=new E.VisionLearner();save();reset();stats();toast('当前赛道的视野驾驶经验已清空。');};
$('help').onclick=()=>{running=false;clearHeld();update();$('helpDialog').showModal();};$('closeHelp').onclick=$('gotIt').onclick=()=>$('helpDialog').close();
$('helpDialog').onclick=e=>{if(e.target===$('helpDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
for(const k of ['maxSpeed','acceleration','steering']){$(k).value=config[k];$(k+'Value').textContent=config[k];$(k).oninput=e=>{config[k]=Number(e.target.value);$(k+'Value').textContent=config[k];persist('apex-car-v2',config);};}
$('carColor').value=config.color;$('carStyle').value=config.style;$('carColor').oninput=e=>{config.color=e.target.value;persist('apex-car-v2',config);$('carLayer').replaceChildren();drawDynamic();};$('carStyle').onchange=e=>{config.style=e.target.value;persist('apex-car-v2',config);$('carLayer').replaceChildren();drawDynamic();};
$('autoConnect').checked=!!load('apex-road-autoconnect-v1',false);$('autoConnect').onchange=e=>{persist('apex-road-autoconnect-v1',e.target.checked);$('editorHint').textContent=e.target.checked?'自动连接已开启：新画的道路会连接相邻道路。':'自动连接已关闭：只连接实际拖动经过的路段，靠近旁边的道路不会粘上。';};
$('visionToggle').onchange=e=>{showVision=e.target.checked;drawVision();};
$('visionRange').oninput=e=>{visionRange=Number(e.target.value);$('visionRangeValue').textContent=visionRange;decision=null;learner.buffer=[];drawVision();};
window.addEventListener('beforeunload',save);const selectedMap=load('apex-selected-map-v1',0);init(Number.isInteger(selectedMap)&&selectedMap>=0&&selectedMap<=3?selectedMap:0);requestAnimationFrame(frame);
})();
