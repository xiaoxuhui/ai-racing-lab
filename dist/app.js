(()=>{'use strict';
const $=id=>document.getElementById(id),E=Racing,NS='http://www.w3.org/2000/svg';
const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}};
const memory=new Map();let learningStorage=null;
let config={color:'#d5ed99',style:'sport',maxSpeed:8,acceleration:2,steering:3,...read('apex-car-v2',{})};
let mapIndex=0,map,learner,state,mode='ai',running=false,training=false,editing=false,tool='road',draft=null,undo=[],editOrigin=0,paintPointer=null,lastCell=null,paintChanged=false,strokePainted=new Set();
let routeVisible=false,trail=[],last=0,accumulator=0,toastTimer,storageAvailable=true,held=new Set(),pointers=new Map(),keys=new Set(),renderClock=0;
let observation=null,showVision=true,visionRange=4;
let liveExplore=!!load('apex-live-explore-v1',false);
let trainingTask=null,progressHideTimer=null;
const latched=new Set(),pointerPresses=new Map();
let angleBeforeDrag=null;
let fleet=null,selectedCar=0,fleetCount=Number(load('apex-fleet-count-v1',8));
if(![1,4,8,12,16].includes(fleetCount))fleetCount=8;
const fleetColors=['#edb374','#8fbdd5','#c2a7d8','#ef978f','#94c7b8','#d9ca83','#a3bde8'];
let showTrails=!!load('apex-show-trails-v1',true),showDeaths=!!load('apex-show-deaths-v1',true);
const physicalKeys=new Set();
function persist(k,v){memory.set(k,v);if(learningStorage&&k.startsWith('apex-vision-v3-')){learningStorage.write(k,v).then(()=>{try{localStorage.removeItem(k);}catch{}}).catch(()=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{toast('学习记忆保存失败，当前经验仍在；请保持页面打开。');}});return;}try{localStorage.setItem(k,JSON.stringify(v));}catch{if(storageAvailable){storageAvailable=false;toast('存储不可用，设置暂时保留在本次页面中。');}}}
function load(k,fallback=null){return memory.has(k)?memory.get(k):read(k,fallback);}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function save(){if(learner)persist('apex-vision-v3-'+mapIndex,learner.serialize());}
function init(index){mapIndex=index;persist('apex-selected-map-v1',index);map=E.makeMap(index,index===3?load('apex-custom-track-v2'):null);learner=new E.FleetLearner(load('apex-vision-v3-'+index));$('mapSelect').value=index;reset();drawMap();stats();}
function clearHeld(){held.clear();keys.clear();physicalKeys.clear();pointers.clear();pointerPresses.clear();latched.clear();document.querySelectorAll('[data-action]').forEach(b=>{b.classList.remove('pressed');b.setAttribute('aria-pressed','false');});}
function reset(resume=false){running=resume&&!E.drivingIssue(map);accumulator=0;learner.buffer=[];clearHeld();fleet=E.drivingIssue(map)?null:new E.FleetWorld(map,learner,config,fleetCount,visionRange);selectedCar=E.clamp(selectedCar,0,fleetCount-1);syncSelected();syncFleetSelector();observation=state?E.sense(map,state,visionRange,fleet.states()):null;$('trailLayer')?.replaceChildren();$('deathLayer')?.replaceChildren();$('result').classList.add('hidden');drawDynamic();update();}
function observedLearner(){return fleet?.cars[selectedCar]?.learner||learner.forCar(selectedCar);}
function syncSelected(){const c=fleet?.cars[selectedCar];state=c?.state??null;trail=c?.trail??[];}
function carColor(id){return config.colors?.[id]||(id===0?config.color:fleetColors[(id-1)%fleetColors.length]);}
function syncFleetSelector(){const select=$('observedCar');select.replaceChildren();for(let i=0;i<fleetCount;i++){const option=document.createElement('option');option.value=i;option.textContent=String(i+1).padStart(2,'0')+' 号';select.appendChild(option);}select.value=selectedCar;$('fleetCount').value=fleetCount;$('carColor').value=carColor(selectedCar);}
function selectCar(id){if(!fleet||editing)return;clearHeld();selectedCar=E.clamp(Number(id),0,fleet.cars.length-1);syncSelected();$('observedCar').value=selectedCar;$('carColor').value=carColor(selectedCar);$('result').classList.add('hidden');drawDynamic();update();}
function ready(){const issue=E.drivingIssue(map);if(issue){toast(issue+'，点「编辑 / 擦除」继续修改。');return false;}return true;}
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
 if(map.start){const[sx,sy]=point(...map.start),g=svg('g',{'data-marker':'start','data-entry-angle':map.startAngle,'aria-label':`入口，朝向 ${map.startAngle} 度`},t);svg('rect',{x:sx-17,y:sy-17,width:34,height:34,rx:7,fill:'#d9edb1',stroke:'#aac783','stroke-width':1.5},g);label(g,sx,sy+4,'→',{fill:'#5a7c39','font-size':18,'text-anchor':'middle',transform:`rotate(${map.startAngle} ${sx} ${sy})`});label(g,sx-14,sy+36,'入口',{fill:'#718958','font-size':9});}
 if(map.goal){const[gx,gy]=point(...map.goal),g=svg('g',{'data-marker':'goal'},t);svg('rect',{x:gx-11,y:gy-17,width:23,height:34,rx:1,fill:'url(#checker)',stroke:'#8b9d77','stroke-width':1},g);label(g,gx-10,gy-29,'出口',{fill:'#697e56','font-size':9});}
 label(t,78,77,'APEX TESTING GROUNDS',{'font-size':9,fill:'#a3af94','letter-spacing':2});label(t,78,92,['OVERPASS CIRCUIT','URBAN CROSSROADS','THE LOOP','YOUR OWN CIRCUIT'][mapIndex],{'font-size':7,fill:'#b0baa3','letter-spacing':1.7});
 const compass=svg('g',{transform:`translate(${view.width-75} ${view.height-85})`},t);svg('circle',{r:20,fill:'none',stroke:'#cbd5be'},compass);svg('path',{d:'M0 -12L5 7L0 4L-5 7Z',fill:'#98a989'},compass);label(compass,0,-27,'N',{'text-anchor':'middle',fill:'#8b9e77','font-size':8});
 svg('g',{id:'trailLayer','pointer-events':'none'},t);svg('g',{id:'deathLayer'},t);svg('g',{id:'visionLayer','pointer-events':'none'},t);svg('g',{id:'carLayer'},t);if(editing)drawEditorGrid(t);drawReference();drawDynamic();
}
function drawReference(){const layer=$('routeLayer');if(!layer)return;layer.replaceChildren();if(!routeVisible||editing||E.mapIssue(map))return;const path=E.smoothPath(E.reference(map));if(path.length)svg('path',{d:pathFor(path.map(p=>[p.x,p.y])),fill:'none',stroke:'#dceeb3','stroke-width':3,'stroke-linecap':'round','stroke-dasharray':'2 7',opacity:.8},layer);}
function drawEditorGrid(t){const g=svg('g',{'pointer-events':'none','data-editor-grid':'true'},t);for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){const[cx,cy]=point(x,y);svg('rect',{x:cx-23.5,y:cy-22.5,width:47,height:45,fill:'transparent',stroke:'#b5c79c','stroke-width':.7,'stroke-dasharray':'2 4',opacity:.65},g);}}
function drawDynamic(refreshVision=true){
 const layer=$('carLayer'),tl=$('trailLayer');if(!layer)return;
 if(editing||!state||!fleet){layer.replaceChildren();tl.replaceChildren();$('deathLayer')?.replaceChildren();$('visionLayer')?.replaceChildren();if(!editing)drawVision();return;}
 const visible=new Set();
 for(const vehicle of fleet.cars){
  if(!vehicle.active&&!(vehicle.finished&&fleet.time-vehicle.finishedAt<.45))continue;
  visible.add(String(vehicle.id));const color=carColor(vehicle.id),model=config.style+'|'+color;
  let car=layer.querySelector(`[data-car-id="${vehicle.id}"]`);
  if(car&&car.dataset.model!==model){car.remove();car=null;}
  if(!car){car=svg('g',{'data-car-id':vehicle.id,'data-model':model,class:'road-car',filter:'url(#carShadow)',role:'button','aria-label':`${vehicle.id+1} 号赛车，点击观察`},layer);
   svg('circle',{'data-selected-ring':'true',r:24,fill:'none',stroke:'#d4efa8','stroke-width':1.5,'stroke-dasharray':'3 4'},car);
  svg('ellipse',{rx:25,ry:23,fill:'#dcf3a2',opacity:.13},car);svg('rect',{x:-13,y:-12,width:8,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:-13,y:7,width:8,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:7,y:-12,width:7,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:7,y:7,width:7,height:5,rx:1,fill:'#354636'},car);svg('rect',{x:-17,y:-9,width:34,height:config.style==='formula'?14:18,rx:config.style==='buggy'?2:6,fill:color,stroke:'#f0ffcd','stroke-width':1.2},car);svg('path',{d:'M-2 -7L7 -6L9 0L7 6L-2 7Z',fill:'#55774a'},car);svg('path',{d:'M-12 -6h5v12h-5z',fill:'#a6c77c'},car);svg('path',{d:'M14 -6v3M14 3v3',stroke:'#f9ffe7','stroke-width':2},car);svg('path',{d:'M-15 -5v3M-15 3v3',stroke:'#bf9964','stroke-width':2},car);
 if(config.style==='formula'){svg('rect',{x:-20,y:-13,width:4,height:26,rx:1,fill:color},car);svg('rect',{x:15,y:-13,width:4,height:26,rx:1,fill:color},car);}
 if(config.style==='buggy')svg('path',{d:'M-8 -9v18M1 -9v18M-8 0h9',stroke:'#3d5337','stroke-width':2},car);
   label(car,0,-19,String(vehicle.id+1).padStart(2,'0'),{'data-car-number':'true','text-anchor':'middle','font-size':9,fill:'#425a37',stroke:'#f5fbe9','stroke-width':2,'paint-order':'stroke'});
   car.addEventListener('click',event=>{if(!editing){event.stopPropagation();selectCar(vehicle.id);}});
  }
  const s=vehicle.state,[x,y]=point(s.x,s.y),angle=s.angle*180/Math.PI;car.setAttribute('transform',`translate(${x} ${y}) rotate(${angle}) scale(.73)`);car.classList.toggle('crashed',s.done&&!s.won);
  car.querySelector('[data-selected-ring]').setAttribute('visibility',vehicle.id===selectedCar?'visible':'hidden');car.querySelector('[data-car-number]').setAttribute('transform',`rotate(${-angle})`);
  let under=false;for(const k of map.bridges){const[bx,by]=k.split(',').map(Number);if(Math.abs(s.x-bx)<.36&&Math.abs(s.y-by)<.32&&Math.abs(Math.sin(s.angle))>.7)under=true;}car.setAttribute('opacity',s.done?.35:under?.35:1);
 }
 for(const node of [...layer.children])if(!visible.has(node.dataset.carId))node.remove();
 drawFleetHistory();if(refreshVision)drawVision();
}
function drawFleetHistory(){
 const layer=$('trailLayer'),deaths=$('deathLayer');if(!layer||!deaths||!fleet||editing)return;const keep=new Set(),marks=new Set();
 for(const car of fleet.cars){
  const color=carColor(car.id),chosen=car.id===selectedCar;
  for(const type of ['live','death']){
   const record=type==='death'?car.lastDeath:null,points=type==='death'?record?.trail:((car.active||car.state.won)?car.trail:null);if(!showTrails||!points||points.length<2)continue;
   const key=car.id+'-'+type,version=type==='death'?record.version:car.trailVersion;keep.add(key);let path=layer.querySelector(`[data-trail-key="${key}"]`);
   if(!path)path=svg('path',{'data-trail-key':key,'data-trail-car':car.id,'data-trail-type':type,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'},layer);
   if(path.dataset.version!==String(version)){path.setAttribute('d',pathFor(points));path.dataset.version=version;}
   path.setAttribute('stroke',color);path.setAttribute('stroke-width',chosen?2.8:1.8);path.setAttribute('opacity',type==='death'?(chosen?.8:.4):(chosen?.95:.6));path.setAttribute('stroke-dasharray',type==='death'?'4 4':'none');
  }
  if(showDeaths&&car.lastDeath){
   const d=car.lastDeath;marks.add(String(car.id));let mark=deaths.querySelector(`[data-death-car="${car.id}"]`);
   if(mark&&mark.dataset.version!==String(d.version)){mark.remove();mark=null;}
   if(!mark){const[x,y]=point(d.state.x,d.state.y);mark=svg('g',{'data-death-car':car.id,'data-version':d.version,transform:`translate(${x} ${y})`,role:'button','aria-label':`${car.id+1} 号第 ${d.attempt} 轮死亡：${d.state.reason}`},deaths);const title=svg('title',{},mark);title.textContent=`${String(car.id+1).padStart(2,'0')} 号 · 第 ${d.attempt} 轮 · ${d.state.reason} · ${d.state.time.toFixed(1)} 秒`;svg('circle',{r:10,fill:'#fff8ef',stroke:color,'stroke-width':1.4,opacity:.9},mark);svg('path',{d:'M-4 -4L4 4M4 -4L-4 4',stroke:'#b6725e','stroke-width':1.8,'stroke-linecap':'round'},mark);label(mark,0,-15,String(car.id+1).padStart(2,'0')+' ×',{'text-anchor':'middle','font-size':8,fill:color,stroke:'#fffef5','stroke-width':2,'paint-order':'stroke'});mark.addEventListener('click',event=>{event.stopPropagation();selectCar(car.id);});}
   mark.setAttribute('opacity',chosen?1:.78);
  }
 }
 for(const path of [...layer.children])if(!keep.has(path.dataset.trailKey))path.remove();for(const mark of [...deaths.children])if(!marks.has(mark.dataset.deathCar))mark.remove();
 for(const path of [...layer.querySelectorAll(`[data-trail-car="${selectedCar}"]`)])layer.appendChild(path);
 const selectedMark=deaths.querySelector(`[data-death-car="${selectedCar}"]`);if(selectedMark)deaths.appendChild(selectedMark);
}
function updateCarRecords(){
 const list=$('carRecords');if(!list)return;const count=fleet?.cars.length||0;if(list.children.length!==count){list.replaceChildren();for(const car of fleet?.cars||[]){const row=document.createElement('button');row.className='car-record';row.dataset.recordCar=car.id;row.addEventListener('click',()=>selectCar(car.id));const id=document.createElement('b');id.textContent=String(car.id+1).padStart(2,'0')+' 号';const status=document.createElement('span');status.className='car-record-status';const death=document.createElement('small');death.className='car-record-death';row.append(id,status,death);list.appendChild(row);}}
 for(const car of fleet?.cars||[]){const row=list.children[car.id];row.style.setProperty('--car-color',carColor(car.id));row.classList.toggle('selected',car.id===selectedCar);row.querySelector('.car-record-status').textContent=(car.active?'行驶 ':car.waiting?'待发 ':car.state.won?'已通关 ':'已死亡 ')+car.state.time.toFixed(1)+' s';const d=car.lastDeath;row.querySelector('.car-record-death').textContent=d?`上次死亡 · 第 ${d.attempt} 轮 · ${d.state.reason} · ${d.state.time.toFixed(1)} s`:'尚无死亡记录';}
}
function drawVision(){
 const layer=$('visionLayer');if(!layer||editing)return;layer.replaceChildren();
 if(!state){$('sensorReadings').replaceChildren();$('qValues').replaceChildren();$('goalBearing').textContent='—';$('trafficSeen').textContent='请先放置入口和出口';$('visionState').textContent='请先放置入口和出口';$('knownStates').textContent=Object.keys(observedLearner().q).length.toLocaleString();return;}
 if(fleet?.cars[selectedCar].waiting&&!fleet.cars[selectedCar].active){$('sensorReadings').replaceChildren();$('qValues').replaceChildren();$('goalBearing').textContent='—';$('trafficSeen').textContent='这辆车正在入口排队，发车后显示实时视野';$('visionState').textContent='待发车';$('rewardValue').textContent=fleet.cars[selectedCar].lastReward.toFixed(2);$('knownStates').textContent=Object.keys(observedLearner().q).length.toLocaleString();return;}
 observation=E.sense(map,state,visionRange,fleet?.states()||[]);const o=observation,[cx,cy]=point(state.x,state.y);
 const seenCars=[...new Set(o.rays.filter(r=>r.kind==='car').map(r=>r.vehicleId))];$('trafficSeen').textContent=seenCars.length?'看见 '+seenCars.map(id=>String(id+1).padStart(2,'0')+' 号').join('、'):'视野内未发现其他车辆';
 if(showVision){
  const ends=o.rays.map(r=>point(state.x+Math.cos(r.angle)*r.distance,state.y+Math.sin(r.angle)*r.distance)),fan='M'+cx+' '+cy+' '+ends.map(p=>'L'+p.join(' ')).join(' ')+' Z';svg('path',{d:fan,fill:'#b8e879',opacity:.13},layer);
  for(let i=0;i<o.rays.length;i++){const r=o.rays[i],[x,y]=ends[i],color=r.kind==='car'?'#6caac9':r.distance<.3?'#e98365':r.distance<.7?'#d8b45e':'#a9d975';svg('line',{x1:cx,y1:cy,x2:x,y2:y,stroke:color,'stroke-width':i===3?1.6:1,'stroke-opacity':.8,'data-hit-kind':r.kind},layer);svg('circle',{cx:x,cy:y,r:i===3?2.8:2,fill:color},layer);}
  const a=state.angle+o.goalBearing,gx=cx+Math.cos(a)*23,gy=cy+Math.sin(a)*23;svg('path',{d:`M${cx} ${cy}L${gx} ${gy}`,stroke:'#b39bcd','stroke-width':1.6,'stroke-dasharray':'2 2'},layer);
 }
 const readings=$('sensorReadings');readings.replaceChildren();
 const names=['左后','左侧','左前','正前','右前','右侧','右后'];
 o.rays.forEach((r,i)=>{const el=document.createElement('div');el.className='sensor-reading';el.dataset.hitKind=r.kind;const title=document.createElement('span');title.textContent=names[i];const meter=document.createElement('i');meter.style.setProperty('--distance',Math.max(2,r.distance/visionRange*100)+'%');meter.style.setProperty('--ray',r.kind==='car'?'#75abc4':r.distance<.3?'#d98b71':r.distance<.7?'#c3aa6e':'#92b96b');const value=document.createElement('b');value.textContent=r.distance.toFixed(2);el.append(title,meter,value);readings.append(el);});
 $('goalBearing').textContent=(o.goalBearing*180/Math.PI).toFixed(0)+'°';$('visionState').textContent=E.observationKey(o);
 const qs=observedLearner().q[E.observationKey(o)]||[0,0,0,0,0],best=Math.max(...qs),scale=Math.max(1,...qs.map(Math.abs));
 $('qValues').replaceChildren();E.ACTIONS.forEach((a,i)=>{const el=document.createElement('div');el.className='q-row'+(qs[i]===best?' best':'');const name=document.createElement('span');name.textContent={straight:'直行',accelerate:'加速',decelerate:'减速',left:'左转',right:'右转'}[a];const bar=document.createElement('i');bar.style.width=(8+Math.abs(qs[i])/scale*52)+'%';const value=document.createElement('b');value.textContent=qs[i].toFixed(2);el.append(name,bar,value);$('qValues').append(el);});
 $('rewardValue').textContent=(fleet?.cars[selectedCar]?.lastReward??learner.lastReward).toFixed(2);$('knownStates').textContent=Object.keys(observedLearner().q).length.toLocaleString();
}
const actionNames={straight:['直行','→'],accelerate:['持续加速','↑'],decelerate:['持续减速','↓'],left:['持续左转','↰'],right:['持续右转','↱']};
function update(){
 updateSurvival();
 $('policyStatus').textContent=observedLearner().episodes?'本车已学 '+observedLearner().episodes.toLocaleString()+' 轮':'本车尚未训练';
 $('memoryStatus').textContent=`${String(selectedCar+1).padStart(2,'0')} 号独立记忆 · 已记忆 ${observedLearner().experience.length.toLocaleString()} 条经历 · ${observedLearner().outcomes.length.toLocaleString()} 条结局 · 累计回放 ${observedLearner().replays.toLocaleString()} 次`;
 $('decisionStatus').textContent=mode==='manual'?'所选赛车由你控制，其余车辆保留学习记忆':fleet?.cars[selectedCar]?.lastExploratory?'本次动作：随机探索':'本次动作：按累计 Q 值选择';
 const active=fleet?.cars.filter(c=>c.active).length||0,waiting=fleet?.cars.filter(c=>c.waiting).length||0;$('fleetStatus').textContent=`在场 ${active} · 等候 ${waiting} · 死亡 ${fleet?.deaths||0}`;$('agentBadge').textContent='CAR '+String(selectedCar+1).padStart(2,'0');$('fleetCount').disabled=training||editing;$('observedCar').disabled=editing||!fleet;$('clearTraces').disabled=training||editing||!fleet;updateCarRecords();
 if(fleet)for(const c of fleet.cars){const option=$('observedCar').options[c.id],text=String(c.id+1).padStart(2,'0')+' 号 · '+(c.active?'行驶':c.waiting?'待发':c.state.won?'已通关':'已结束');if(option&&option.textContent!==text)option.textContent=text;}
 $('aiMode').classList.toggle('active',mode==='ai');$('manualMode').classList.toggle('active',mode==='manual');$('aiMode').setAttribute('aria-pressed',mode==='ai');$('manualMode').setAttribute('aria-pressed',mode==='manual');
 const issue=E.drivingIssue(map),warning=E.mapIssue(map);$('trackNotice').classList.toggle('hidden',editing||!warning);$('trackIssue').textContent=warning+(!issue?'；仍可尝试驾驶和训练':'');
 $('start').disabled=training||editing||!!issue;$('train').disabled=editing||!!issue||!!trainingTask?.stop;$('retrain').disabled=editing||!!issue;$('releaseControls').disabled=training||editing||!!issue;$('routeToggle').disabled=editing||!!warning;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=training||editing||!!issue);
 $('train').innerHTML=training?(trainingTask?.stop?'正在停止…':'Ⅱ 停止训练'):(learner.episodes?'✧ 继续训练 5,000 轮 <span>→</span>':'✧ 开始训练 5,000 轮 <span>→</span>');$('retrain').textContent=training?'↺ 停止并从零训练':'↺ 从零重新训练';$('trainingHint').textContent=issue?'无法开始：'+issue:'继续训练保留 Q 表和跨轮记忆；从零重新训练会清空两者并立即训练。';
 if(!state){$('speed').innerHTML='— <small>格 / 秒</small>';$('elapsed').textContent='00:00.0';$('steps').innerHTML='0.00 <small>格</small>';$('action').textContent='等待设置';$('runStatus').textContent=editing?'正在编辑赛道':issue;$('coordinates').textContent='地图草稿 · '+map.width+' × '+map.height;$('start').textContent='请先补齐赛道';return;}$('speed').innerHTML=state.speed.toFixed(2)+' <small>格 / 秒</small>';
 const sec=state.time;$('elapsed').innerHTML=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(Math.floor(sec%60)).padStart(2,'0')+'<small>.'+Math.floor((sec%1)*10)+'</small>';
 $('steps').innerHTML=state.distance.toFixed(2)+' <small>格</small>';
 const an=actionNames[state.action]||actionNames.straight;$('action').innerHTML=(state.time?an[0]:'等待指令')+' <span>'+an[1]+'</span>';
 $('start').innerHTML=running?'Ⅱ 暂停车队':fleet?.allFinished?'↺ 车队再跑一轮':'<span>▶</span> '+(state.time?'继续车队驾驶':mode==='ai'?'开始实时车队训练':'开始车队驾驶');
 $('runStatus').textContent=editing?'正在编辑赛道':training?'车队正在加速训练':fleet?.cars[selectedCar].waiting?'所选赛车排队出发':state.done?state.reason:running?'车队连续行驶中':state.time?'已暂停':'等待车队出发';
 $('coordinates').textContent=`位置 (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) · 朝向 ${((state.angle*180/Math.PI%360+360)%360).toFixed(0)}°`;
 $('modeTitle').textContent=mode==='ai'?'训练你的赛车':'接管方向盘';
 $('modeDesc').textContent=mode==='ai'?`${fleetCount} 辆车在同一赛道同时学习，各自保存 Q 表和记忆。蓝色射线表示探测到其他车辆。`:`你正在接管 ${String(selectedCar+1).padStart(2,'0')} 号车，其余赛车继续自动学习。轻点保持动作，再点松开。`;
 $('actionHint').textContent=held.size?'持续执行：'+[...held].map(a=>actionNames[a][0]).join(' + ')+(latched.size?' · 再点同一按钮或「松开全部」停止施加动作':''):'轻点保持动作，再点松开；长按与键盘松手后保持当前车速和方向。';
}
function stats(){
 updateSurvival();
 const n=learner.episodes;$('episodes').innerHTML=n.toLocaleString()+' <small>轮</small>';const rate=learner.results.length?Math.round(100*learner.results.reduce((a,b)=>a+b,0)/learner.results.length):null;$('successRate').innerHTML=(rate??'—')+' <small>%</small>';$('bestTime').innerHTML=(learner.best===null?'—':learner.best.toFixed(1))+' <small>秒</small>';$('policyStatus').textContent=observedLearner().episodes?'本车已学 '+observedLearner().episodes.toLocaleString()+' 轮':'本车尚未训练';
 const distances=learner.distances,average=distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:0;$('learningNote').innerHTML=n?'最近 '+distances.length+' 轮平均行驶 '+average.toFixed(2)+' 格。<br><span>已学习 '+n.toLocaleString()+' 轮，继续观察与训练。</span>':'从射线距离开始积累驾驶经验。<br><span>先训练，再观察 Q 值怎样影响动作。</span>';
 const h=learner.history,sl=$('sparkline');sl.replaceChildren();if(h.length>1){const d=h.map((v,i)=>`${i?'L':'M'}${(i/(h.length-1)*108+2).toFixed(1)},${(36-v*30).toFixed(1)}`).join(' ');svg('path',{d:d+' L110 40 L2 40Z',fill:'#eff5e4'},sl);svg('path',{d,fill:'none',stroke:'#97b66b','stroke-width':1.7},sl);}drawVision();
}
function updateSurvival(){$('survivalCard').classList.toggle('hidden',learner.hasCleared);$('survivalInline').classList.toggle('hidden',learner.hasCleared);document.querySelector('.stats-row').classList.toggle('has-survival',!learner.hasCleared);$('longestSurvival').innerHTML=learner.longestSurvival.toFixed(1)+' <small>秒</small>';$('longestSurvivalLive').textContent=learner.longestSurvival.toFixed(1)+' 秒';}

function handleFleetEvents(persistRecords=true){
 const events=fleet?.drainEvents()||[];if(!events.length)return;
 if(!training)for(const event of events)if(event.id===selectedCar){const s=event.state;$('result').classList.remove('hidden');$('result').innerHTML=String(event.id+1).padStart(2,'0')+' 号 · '+(s.won?'⚑ 成功抵达出口！':'↺ '+s.reason)+'<small>'+s.distance.toFixed(2)+' 格 · '+s.time.toFixed(1)+' 秒'+($('autoRepeat').checked?' · 已记录，将自动重新出发':' · 已记录，其余赛车继续运行')+'</small>';clearHeld();}
 if(persistRecords){if(performance.now()-lastFleetSave>1000||fleet.allFinished){save();lastFleetSave=performance.now();}stats();}
}
let lastFleetSave=0;
function advance(dt){
 if(!fleet)return;fleet.range=visionRange;
 fleet.step(dt,{manualId:mode==='manual'?selectedCar:-1,control:{throttle:held.has('accelerate')?1:0,brake:held.has('decelerate')?1:0,steer:(held.has('right')?1:0)-(held.has('left')?1:0)},epsilon:liveExplore?Number($('exploration').value)/100:0,repeat:$('autoRepeat').checked});syncSelected();
}
function frame(now){
 const elapsed=last?Math.min((now-last)/1000,1):0;last=now;
 if(running&&!training&&!editing&&fleet){
  accumulator+=elapsed;while(accumulator>=1/120&&($('autoRepeat').checked||!fleet.allFinished)){advance(1/120);accumulator-=1/120;}
  handleFleetEvents();
  if(!$('autoRepeat').checked&&fleet.allFinished){running=false;save();update();}
  drawDynamic(false);renderClock+=elapsed;if(renderClock>1/15){renderClock=0;update();drawVision();}
 }
 requestAnimationFrame(frame);
}
function start(){if(training||editing||!ready())return;if(!running&&fleet?.allFinished)reset();running=!running;accumulator=0;if(running)last=performance.now();clearHeld();update();}
function setMode(next){if(training||editing||mode===next)return;mode=next;const car=fleet?.cars[selectedCar];if(car){car.decision=null;car.buffer=[];}clearHeld();update();}
function refreshHeld(){held=new Set([...keys,...pointers.values(),...latched]);document.querySelectorAll('[data-action]').forEach(b=>{const on=held.has(b.dataset.action);b.classList.toggle('pressed',on);b.setAttribute('aria-pressed',on);});update();}
function clearOpposite(a){latched.delete(({accelerate:'decelerate',decelerate:'accelerate',left:'right',right:'left'})[a]);}
function takeControl(){if(training||editing||!ready())return false;const car=fleet?.cars[selectedCar];if(!car)return false;if(car.finished&&!car.waiting)fleet.restartCar(selectedCar);if(mode==='ai'){mode='manual';car.decision=null;car.buffer=[];}if(!running){last=performance.now();accumulator=0;}running=true;syncSelected();update();return true;}
function locked(v){for(const id of ['mapSelect','start','reset','clearTraining','editTrack','aiMode','manualMode'])$(id).disabled=v;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=v);}
async function train(fresh=false){
 if(trainingTask){trainingTask.stop=true;trainingTask.restart=trainingTask.restart||fresh;update();return;}
 if(editing||!ready())return;
 running=false;mode='ai';clearHeld();if(fresh){learner=new E.FleetLearner();save();}reset();stats();
 const job={stop:false,restart:false};trainingTask=job;training=true;learner.buffer=[];locked(true);clearTimeout(progressHideTimer);$('trainingProgress').classList.remove('hidden');$('progressBar').style.width='0%';$('progressText').textContent=fresh?'已清空经验，从零开始…':'准备继续训练…';let count=0,failed=false;const epsilon=Number($('exploration').value)/100;update();
 const startingEpisodes=learner.episodes;
 try{while(count<5000&&!job.stop){const started=performance.now();do{fleet.step(1/120,{epsilon:Math.max(.03,epsilon/(1+learner.episodes/2000)),repeat:true});count=learner.episodes-startingEpisodes;}while(count<5000&&performance.now()-started<12);syncSelected();handleFleetEvents(false);$('progressBar').style.width=Math.min(100,count/50)+'%';$('progressText').textContent=`${fleetCount} 辆并行 · 本次 ${count.toLocaleString()} / 5,000 轮 · 累计 ${learner.episodes.toLocaleString()} 轮`;drawDynamic(false);update();stats();await new Promise(r=>setTimeout(r,0));}}
 catch(error){failed=true;toast('训练中断：'+error.message);}
 finally{training=false;trainingTask=null;locked(false);save();running=false;accumulator=0;clearHeld();syncSelected();drawDynamic();update();stats();if(job.restart){void train(true);}else{if(!failed)toast(`${job.stop?'已停止，保留':'本次完成'} ${count.toLocaleString()} 轮训练；可继续训练或从零重训。`);progressHideTimer=setTimeout(()=>$('trainingProgress').classList.add('hidden'),1800);}}
}
function beginEditor(){
 if(training)return;save();running=false;clearHeld();editing=true;editOrigin=mapIndex;draft=E.serializeMap(map);undo=[];paintPointer=null;angleBeforeDrag=null;
 $('editor').classList.remove('hidden');document.querySelector('.track-panel').classList.add('editing');syncEditorFields();$('mapSelect').disabled=true;$('start').disabled=true;$('train').disabled=true;$('editTrack').disabled=true;$('clearTraining').disabled=true;$('reset').disabled=true;drawMap();update();
}
function syncEditorFields(){const angle=draft.startAngle??draft.startDir*90;$('entryDirection').value=angle%90===0?String(angle/90):'custom';$('entryAngle').value=angle;$('entryAngleRange').value=angle;$('mapWidth').value=draft.width;$('mapHeight').value=draft.height;}
function rebuildDraft(){map=E.makeMap(3,draft);syncEditorFields();drawMap();update();}
function endEditor(saveChanges){
 if(!editing)return;
 if(saveChanges){
  if(!$('entryAngle').reportValidity())return;setEntryAngle(Number($('entryAngle').value));
  if(!applyDraftSize())return;
  persist('apex-custom-track-v2',draft);persist('apex-vision-v3-3',null);
 }
 editing=false;paintPointer=null;draft=null;undo=[];$('editor').classList.add('hidden');document.querySelector('.track-panel').classList.remove('editing');locked(false);$('train').disabled=false;init(saveChanges?3:editOrigin);if(saveChanges)toast(E.drivingIssue(map)?'地图草稿已保存；放好入口和出口后即可尝试。':E.mapIssue(map)?'赛道已保存；道路未完全连通，仍可尝试驾驶和训练。':'自定义赛道已保存，可以开始驾驶或训练。');
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
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('selected',x===b));$('editorHint').textContent=tool==='erase'?'点入口或出口会先擦掉标记、保留道路，再擦一次删除道路。支持撤销。':tool==='bridge'?'点击十字交叉处放置高架，上下道路互不连通。':tool==='start'?'点击地图移动入口；用下方旋转按钮或角度调整方向。R 右转 90°，Shift+R 左转。':tool==='goal'?'点击任意格子放置或移动出口，旧出口会自动移走。':'拖动绘制道路；地图不完整也可以保存草稿。';});
function setEntryAngle(value,record=true){if(!editing||!Number.isFinite(value))return;const angle=((value%360)+360)%360;if(angle===(draft.startAngle??draft.startDir*90))return;if(record)undo.push(JSON.stringify(draft));draft.startAngle=angle;draft.startDir=Math.round(angle/90)%4;rebuildDraft();$('editorHint').textContent=`入口朝向 ${angle}°（0° 东、90° 南、180° 西、270° 北）。保存后赛车按此方向出发。`;}
$('entryDirection').onchange=e=>{if(e.target.value!=='custom')setEntryAngle(Number(e.target.value)*90);};
$('rotateEntryLeft').onclick=()=>setEntryAngle((draft.startAngle??draft.startDir*90)-90);$('rotateEntryRight').onclick=()=>setEntryAngle((draft.startAngle??draft.startDir*90)+90);
$('entryAngle').onchange=e=>{if(e.target.reportValidity())setEntryAngle(Number(e.target.value));};$('entryAngle').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}};
$('entryAngleRange').oninput=e=>{if(angleBeforeDrag===null)angleBeforeDrag=JSON.stringify(draft);setEntryAngle(Number(e.target.value),false);};$('entryAngleRange').onchange=()=>{if(angleBeforeDrag&&angleBeforeDrag!==JSON.stringify(draft))undo.push(angleBeforeDrag);angleBeforeDrag=null;};
$('undoEdit').onclick=()=>{if(undo.length){angleBeforeDrag=null;draft=JSON.parse(undo.pop());rebuildDraft();}};
$('editTrack').onclick=beginEditor;$('saveTrack').onclick=()=>endEditor(true);$('cancelEdit').onclick=()=>endEditor(false);
$('fixMap').onclick=beginEditor;
function applyDraftSize(){if(!editing)return false;if(!$('mapWidth').reportValidity()||!$('mapHeight').reportValidity())return false;const width=Number($('mapWidth').value),height=Number($('mapHeight').value);if(width===draft.width&&height===draft.height)return true;undo.push(JSON.stringify(draft));draft=E.resizeMap(draft,width,height);rebuildDraft();$('editorHint').textContent=`已调整为 ${draft.width} 列 × ${draft.height} 行；边界外的内容已裁掉，可撤销恢复。`;return true;}
$('applySize').onclick=applyDraftSize;
for(const [id,field]of [['removeStart','start'],['removeGoal','goal']])$(id).onclick=()=>{if(!editing||!draft[field])return;undo.push(JSON.stringify(draft));draft[field]=null;rebuildDraft();$('editorHint').textContent=field==='start'?'入口已擦除。选择「入口」后点击新位置，或先保存草稿。':'出口已擦除。选择「出口」后点击新位置，或先保存草稿。';};
$('start').onclick=start;$('reset').onclick=()=>{if(!training&&!editing){save();reset();stats();}};$('train').onclick=()=>train(false);$('retrain').onclick=()=>train(true);$('releaseControls').onclick=()=>{clearHeld();refreshHeld();};
$('aiMode').onclick=()=>setMode('ai');$('manualMode').onclick=()=>setMode('manual');
document.querySelectorAll('[data-action]').forEach(b=>{
 b.addEventListener('pointerdown',e=>{if(e.button>0||!takeControl())return;e.preventDefault();const a=b.dataset.action,wasLatched=latched.has(a);latched.delete(a);clearOpposite(a);pointerPresses.set(e.pointerId,{a,wasLatched,at:performance.now()});b.setPointerCapture(e.pointerId);pointers.set(e.pointerId,a);refreshHeld();});
 const release=e=>{const press=pointerPresses.get(e.pointerId);if(press&&e.type==='pointerup'&&performance.now()-press.at<250&&!press.wasLatched){clearOpposite(press.a);latched.add(press.a);}pointerPresses.delete(e.pointerId);pointers.delete(e.pointerId);refreshHeld();};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
 b.addEventListener('click',e=>{if(e.detail!==0||!takeControl())return;const a=b.dataset.action;if(latched.has(a))latched.delete(a);else{clearOpposite(a);latched.add(a);}refreshHeld();});
});
const keyActions={w:'accelerate',s:'decelerate',a:'left',d:'right',arrowup:'accelerate',arrowdown:'decelerate',arrowleft:'left',arrowright:'right'};
window.addEventListener('keydown',e=>{
 if($('helpDialog').open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();
 if(keyActions[k]){e.preventDefault();if(e.repeat||!takeControl())return;clearOpposite(keyActions[k]);latched.delete(keyActions[k]);physicalKeys.add(k);keys=new Set([...physicalKeys].map(k=>keyActions[k]));refreshHeld();}
 else if(k===' '&&!e.repeat&&e.target.tagName!=='BUTTON'){e.preventDefault();start();}else if(k==='r'&&!e.repeat){if(editing&&tool==='start'){e.preventDefault();setEntryAngle((draft.startAngle??draft.startDir*90)+(e.shiftKey?-90:90));}else if(!editing&&!training)reset();}
});
window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(keyActions[k]){physicalKeys.delete(k);keys=new Set([...physicalKeys].map(k=>keyActions[k]));refreshHeld();}});
function releaseAll(){clearHeld();if(running){running=false;update();}}
window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});
$('exploration').oninput=e=>$('exploreValue').textContent=e.target.value+'%';$('mapSelect').onchange=e=>{save();init(Number(e.target.value));toast('已切换赛道。');};
$('routeToggle').onclick=()=>{routeVisible=!routeVisible;$('routeToggle').setAttribute('aria-pressed',routeVisible);drawReference();};
$('clearTraining').onclick=()=>{if(training||editing)return;learner=new E.FleetLearner();save();reset();stats();toast('当前赛道的视野驾驶经验已清空。');};
$('help').onclick=()=>{running=false;clearHeld();update();$('helpDialog').showModal();};$('closeHelp').onclick=$('gotIt').onclick=()=>$('helpDialog').close();
$('helpDialog').onclick=e=>{if(e.target===$('helpDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
for(const k of ['maxSpeed','acceleration','steering']){$(k).value=config[k];$(k+'Value').textContent=config[k];$(k).oninput=e=>{config[k]=Number(e.target.value);$(k+'Value').textContent=config[k];persist('apex-car-v2',config);};}
$('carColor').value=config.color;$('carStyle').value=config.style;$('carColor').oninput=e=>{config.colors={...config.colors,[selectedCar]:e.target.value};if(selectedCar===0)config.color=e.target.value;persist('apex-car-v2',config);$('carLayer').replaceChildren();drawDynamic();};$('carStyle').onchange=e=>{config.style=e.target.value;persist('apex-car-v2',config);$('carLayer').replaceChildren();drawDynamic();};
$('autoConnect').checked=!!load('apex-road-autoconnect-v1',false);$('autoConnect').onchange=e=>{persist('apex-road-autoconnect-v1',e.target.checked);$('editorHint').textContent=e.target.checked?'自动连接已开启：新画的道路会连接相邻道路。':'自动连接已关闭：只连接实际拖动经过的路段，靠近旁边的道路不会粘上。';};
$('visionToggle').onchange=e=>{showVision=e.target.checked;drawVision();};
$('visionRange').oninput=e=>{visionRange=Number(e.target.value);$('visionRangeValue').textContent=visionRange;if(fleet){fleet.range=visionRange;for(const car of fleet.cars){car.decision=null;car.buffer=[];}}drawVision();};
$('fleetCount').onchange=e=>{if(training||editing)return;save();fleetCount=Number(e.target.value);persist('apex-fleet-count-v1',fleetCount);reset();stats();e.target.blur();toast(`已切换为 ${fleetCount} 辆赛车，学习经验保留。`);};$('observedCar').onchange=e=>{selectCar(Number(e.target.value));e.target.blur();};
$('liveExplore').checked=liveExplore;$('liveExplore').onchange=e=>{liveExplore=e.target.checked;persist('apex-live-explore-v1',liveExplore);update();};
$('showTrails').checked=showTrails;$('showTrails').onchange=e=>{showTrails=e.target.checked;persist('apex-show-trails-v1',showTrails);drawDynamic();};$('showDeaths').checked=showDeaths;$('showDeaths').onchange=e=>{showDeaths=e.target.checked;persist('apex-show-deaths-v1',showDeaths);drawDynamic();};$('clearTraces').onclick=()=>{if(!fleet||training||editing)return;fleet.clearHistory();drawDynamic();update();toast('已清除画面轨迹和死亡标记，学习经验保留。');};
window.addEventListener('beforeunload',()=>{if(learner)save();});
async function boot(){const controls=[...document.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);$('runStatus').textContent='正在载入赛车记忆…';try{learningStorage=await openLearningStorage();if(learningStorage){const saved=await learningStorage.read([0,1,2,3].map(i=>'apex-vision-v3-'+i));for(const[k,v]of saved)memory.set(k,v);}}catch{learningStorage=null;}controls.forEach(([el,disabled])=>el.disabled=disabled);const selectedMap=load('apex-selected-map-v1',0);init(Number.isInteger(selectedMap)&&selectedMap>=0&&selectedMap<=3?selectedMap:0);requestAnimationFrame(frame);}
void boot();
})();
