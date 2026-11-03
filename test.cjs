const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('./dist/engine.js');
require('./dist/vision.js');
require('./dist/fleet.js');
let seed = 19656;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const config = { maxSpeed: 8, acceleration: 2, steering: 3 }, map = E.makeMap(0);
const survival = new E.VisionLearner();
assert.equal(survival.longestSurvival,0);
assert.equal(survival.hasCleared,false);
survival.observeSurvival({time:5.25,won:false});
survival.observeSurvival({time:2,won:false});
assert.equal(survival.longestSurvival,5.25,'A shorter run must not lower the survival record');
assert.equal(survival.episodes,0,'Live/manual survival tracking must not count extra training episodes');
survival.record({time:8,won:false,distance:3});
assert.equal(survival.longestSurvival,8,'Fast training episodes must update survival');
survival.observeSurvival({time:4,won:true});
assert.equal(survival.hasCleared,true,'A successful manual or AI run must mark the track complete');
assert.equal(survival.best,4);
for(let i=0;i<110;i++)survival.record({time:1,won:false,distance:1});
assert.equal(survival.hasCleared,true,'Passing a track must remain remembered beyond the recent 100 results');
const restoredSurvival=new E.VisionLearner(JSON.parse(JSON.stringify(survival.serialize())));
assert.equal(restoredSurvival.longestSurvival,8);
assert.equal(restoredSurvival.hasCleared,true);
assert.equal(new E.VisionLearner({best:3.5}).hasCleared,true,'Previously completed tracks should hide the new statistic immediately');
assert.equal(new E.VisionLearner().hasCleared,false,'From-zero training should restore the survival statistic');
const distanceRecord=new E.VisionLearner();distanceRecord.observeSurvival({won:true,time:1,distance:12});distanceRecord.observeSurvival({won:true,time:100,distance:8});
assert.equal(distanceRecord.bestDistance,8,'A slower but shorter successful route must improve the distance record');
assert.equal(new E.VisionLearner(JSON.parse(JSON.stringify(distanceRecord.serialize()))).bestDistance,8);
assert.equal(new E.VisionLearner({best:3.5}).bestDistance,null,'Do not invent a distance record from an old time record');
for(const angle of [0,37,90,180,270,359]){
 const rotated=E.makeMap(3,{...E.serializeMap(map),startAngle:angle});
 assert(Math.abs(E.continuousInitial(rotated).angle-angle*Math.PI/180)<1e-12,'Departure direction must use the exact angle rather than snap to a cardinal');
 const restored=E.makeMap(3,JSON.parse(JSON.stringify(E.serializeMap(rotated))));
 assert.equal(restored.startAngle,angle,'Saving and reloading must preserve entrance rotation');
 assert.equal(E.resizeMap(E.serializeMap(restored),30,20).startAngle,angle,'Resizing must retain entrance rotation');
 assert(Math.abs(E.sense(restored,E.continuousInitial(restored)).rays[3].angle-angle*Math.PI/180)<1e-12,'Front sensor must rotate with the entrance and car');
}
const legacyNorth=E.makeMap(3,{roads:['2,2','2,1'],start:[2,2],goal:[2,1],startDir:3});
assert.equal(legacyNorth.startAngle,270,'Old cardinal-direction saves must keep their original orientation');
const rotatedBack=E.makeMap(3,{...E.serializeMap(map),startAngle:-90});
assert.equal(rotatedBack.startAngle,270);
const separate = E.makeMap(3,{width:10,height:8,roads:['2,2','3,2'],edges:[],bridges:[],start:[2,2],goal:[3,2],startDir:0});
assert.equal(separate.edges.size,0,'Adjacent road cells must stay separate without an explicit stroke');
assert(!E.onRoad(separate,2.5,2),'Road geometry must not invent a connection between neighboring cells');
assert(E.mapIssue(separate),'Reference reachability must respect missing road connections');
assert.equal(E.drivingIssue(separate),'','Disconnected tracks must still allow attempts and retraining');
assert(E.sense(separate,E.continuousInitial(separate)).rays[3].distance<.4,'Vision must see the gap instead of a made-up connector');
const connected=E.makeMap(3,{...E.serializeMap(separate),edges:[E.edgeKey('2,2','3,2')]});
assert(E.onRoad(connected,2.5,2));
assert.equal(E.mapIssue(connected),'');
assert.equal(E.makeMap(3,E.serializeMap(separate)).edges.size,0,'Saving must not re-enable automatic connection');
const clippedEdges=E.resizeMap({...E.serializeMap(connected),edges:[E.edgeKey('2,2','3,2')]},5,5);
assert.equal(clippedEdges.edges.length,1);
// Unplaced markers are real draft state, and must not silently respawn.
const noEntry = E.makeMap(3, { ...E.serializeMap(map), start: null });
assert.equal(noEntry.start, null);
assert.match(E.mapIssue(noEntry), /入口/);
assert.match(E.drivingIssue(noEntry), /入口/);
assert.equal(E.serializeMap(noEntry).start, null);
const noExit = E.makeMap(3, { ...E.serializeMap(map), goal: null });
assert.equal(noExit.goal, null);
assert.equal(noExit.dist.size, 0);
assert.deepEqual(E.reference(noExit), []);
const emptyDraft = E.makeMap(3, { width: 30, height: 20, roads: [], bridges: [], start: null, goal: null });
assert.equal(E.makeMap(3, JSON.parse(JSON.stringify(E.serializeMap(emptyDraft)))).width, 30);
const grown = E.resizeMap(E.serializeMap(map), 30, 20);
assert.deepEqual(grown.start, map.start);
assert.equal(grown.width, 30);
assert.equal(grown.height, 20);
const cropped = E.resizeMap(grown, 8, 6);
assert.equal(cropped.start, null);
assert.equal(cropped.goal, null);
assert(cropped.roads.every(k => {const [x,y] = k.split(',').map(Number);return x < 8 && y < 6;}));
const farRoad = [];
for (let x = 20; x <= 28; x++) farRoad.push(`${x},15`);
const largeTrack = E.makeMap(3, {width:30,height:20,roads:farRoad,bridges:[],start:[20,15],goal:[28,15],startDir:0});
assert.equal(E.mapIssue(largeTrack), '');
assert(E.onRoad(largeTrack, 25, 15));
assert.equal(E.sense(largeTrack, E.continuousInitial(largeTrack)).rays[3].distance, 4, 'New map area must be included in the ray-casting field');
let largeCar = {...E.continuousInitial(largeTrack), x:27.8};
largeCar = E.advanceManual(largeTrack,largeCar,E.CONTROLS.straight,1/120,config);
assert(largeCar.won, 'Moved exit must end the race in the expanded area');
let car = E.continuousInitial(map);
car = E.advanceManual(map, car, { throttle: 1, brake: 0, steer: 0 }, 1 / 120, config);
assert(car.x > 0 && car.x < .02);
assert(car.speed > 1 && car.speed < 1.02);
const coasting = E.advanceManual(map, car, { throttle: 0, brake: 0, steer: 0 }, 1 / 120, config);
assert.equal(coasting.speed, car.speed);
function driveFor(seconds,control){let s=E.continuousInitial(map);for(let i=0;i<Math.round(seconds*120);i++)s=E.advanceManual(map,s,control,1/120,config);return s;}
const oneSecondCoast=driveFor(1,E.CONTROLS.straight),oneSecondGas=driveFor(1,E.CONTROLS.accelerate);
assert(Math.abs(oneSecondCoast.distance-1)<1e-8);
assert(Math.abs(oneSecondGas.distance-2)<1e-8,'Holding gas for one second must move two units, rather than merely changing the displayed speed');
assert(oneSecondGas.x>oneSecondCoast.x*1.9);
for (const steer of [-1, 1]) {
  const turned = E.advanceManual(map, { ...car, x: 4, y: 8, speed: 6 }, { throttle: 0, brake: 0, steer }, 1 / 120, config);
  assert(!turned.done, 'High speed must not prohibit turning');
  assert.equal(Math.sign(turned.angle), steer);
}
const stopped = E.advanceManual(map, { ...car, speed: 0 }, { throttle: 0, brake: 1, steer: 0 }, 1 / 120, config);
assert.equal(stopped.speed, 0);
assert.equal(stopped.x, car.x);

const initial = E.continuousInitial(map), seen = E.sense(map, initial);
const observer={...initial,x:2,carId:0},frontCar={...initial,x:3,carId:1};
const traffic=E.sense(map,observer,4,[observer,frontCar]);
assert.equal(traffic.rays[3].kind,'car');
assert.equal(traffic.rays[3].vehicleId,1);
assert(Math.abs(traffic.rays[3].distance-.74)<1e-10,'Front ray must stop at the other vehicle body');
assert.notEqual(E.observationKey(traffic),E.observationKey(E.sense(map,observer)),'Traffic must influence the policy state');
assert.equal(E.policyKey(traffic),E.policyKey(E.sense(map,observer)),'Visible ghost cars must not hide the road geometry used to drive the champion policy');
assert.equal(traffic.rays[3].roadDistance,4,'Keep a separate road scan while still visibly detecting the front car');
const yielding={...observer,speed:0,time:10.1};E.rewardFor(map,{...observer,speed:0,time:0},yielding,new Set(),traffic);assert(!yielding.done,'Stationary parking must remain allowed even when ghost traffic is visible');
assert.equal(E.sense(map,observer,4,[observer]).rays[3].kind,'clear','A car must not see itself');
const underpass={...initial,x:6,y:5,angle:Math.PI/2,carId:2,bridgeLock:{x:6,y:5,axis:'v'}},overpass={...initial,x:6,y:5,carId:3,bridgeLock:{x:6,y:5,axis:'h'}};
assert(!E.sameDeck(map,underpass,overpass));
assert(E.sense(map,underpass,4,[underpass,overpass]).rays.every(r=>r.kind!=='car'),'Other bridge deck must not occlude vehicle vision');
assert(E.sense(map,{...initial,x:4.5,y:5,carId:4},4,[underpass]).rays.every(r=>r.kind!=='car'),'Approaching an overpass must not see underpass vehicles as obstacles');
const fleetLearner=new E.VisionLearner();fleetLearner.choose=()=> 'straight';
const fleetWorld=new E.FleetWorld(map,fleetLearner,config,8);
for(let i=0;i<600;i++)fleetWorld.step(1/120,{repeat:false});
assert.equal(fleetWorld.cars.filter(c=>c.active).length,8,'Eight independent cars must drive simultaneously');
assert.equal(new Set(fleetWorld.cars.map(c=>c.state.x.toFixed(3))).size,8,'Cars must have their own positions');
assert(fleetWorld.observe(fleetWorld.cars[7]).rays.some(r=>r.kind==='car'));
assert.equal(fleetWorld.deaths,0,'All cars on the straight road should remain alive');
const fairLearner=new E.VisionLearner();fairLearner.choose=()=> 'straight';const fairWorld=new E.FleetWorld(separate,fairLearner,config,8);for(let i=0;i<960;i++)fairWorld.step(1/120);assert(fairWorld.cars.every(c=>c.attempts>0),'Earlier car numbers must not starve later cars in the entrance queue');
assert(fleetWorld.cars.every(c=>c.buffer!==fleetWorld.cars[(c.id+1)%8].buffer),'Replay traces must be private to each car');
const crashWorld=new E.FleetWorld(map,new E.VisionLearner(),config,2);
crashWorld.learner.choose=()=> 'straight';
for(const c of crashWorld.cars){c.active=true;c.waiting=false;c.state={...initial,x:2+c.id*.3,speed:1,angle:c.id?Math.PI:0,carId:c.id};}
for(let i=0;i<60;i++)crashWorld.step(1/120,{repeat:false});
assert(crashWorld.cars.every(c=>c.active&&!c.state.done),'Overlapping vehicles must not kill either car');
assert(crashWorld.cars[0].state.x>crashWorld.cars[1].state.x,'Cars must be able to pass through each other');
assert.equal(crashWorld.deaths,0);
assert.equal(crashWorld.learner.episodes,0,'Vehicle contact must not end a training attempt');
const blockedSpawn=new E.FleetWorld(map,new E.VisionLearner(),config,2);blockedSpawn.learner.choose=()=> 'straight';blockedSpawn.cars[0].state.speed=0;for(let i=0;i<120;i++)blockedSpawn.step(1/120,{manualId:0,control:E.CONTROLS.straight,repeat:false});assert(blockedSpawn.cars[1].active,'An occupied entrance must not block spawning when car collisions are disabled');
const bridgeWorld=new E.FleetWorld(map,new E.VisionLearner(),config,2);
bridgeWorld.cars[0].state={...overpass,speed:0,carId:0};bridgeWorld.cars[1].state={...underpass,speed:0,carId:1};for(const c of bridgeWorld.cars){c.active=true;c.waiting=false;}
bridgeWorld.step(1/120,{repeat:false});assert.equal(bridgeWorld.deaths,0,'Different bridge layers must remain independent');
const deathsWorld=new E.FleetWorld(map,new E.VisionLearner(),config,2);deathsWorld.learner.choose=()=> 'straight';
for(const c of deathsWorld.cars){c.active=true;c.waiting=false;c.attempts=1;c.state={...initial,x:c.id?0:14.32,angle:c.id?Math.PI:0,speed:1,carId:c.id};c.trail=[[c.id?2:10,8],[c.state.x,c.state.y]];}
for(let i=0;i<80&&!deathsWorld.allFinished;i++)deathsWorld.step(1/120,{repeat:false});
assert.equal(deathsWorld.deaths,2,'Leaving the road must still kill each car independently');
assert(deathsWorld.cars.every(c=>c.lastDeath&&c.lastDeath.state.reason==='驶出道路'));
assert(deathsWorld.cars[0].lastDeath.state.x>14&&deathsWorld.cars[1].lastDeath.state.x<0,'Death positions must belong to the correct car');
const deathSnapshot=JSON.stringify(deathsWorld.cars[0].lastDeath);deathsWorld.spawn(deathsWorld.cars[0]);
assert.equal(JSON.stringify(deathsWorld.cars[0].lastDeath),deathSnapshot,'Respawning must retain the previous death trajectory');
assert.notEqual(deathsWorld.cars[0].lastDeath.trail,deathsWorld.cars[0].trail,'Death snapshots must not share a mutable live trajectory');
assert.deepEqual(deathsWorld.cars[0].lastDeath.trail.at(-1),[deathsWorld.cars[0].lastDeath.state.x,deathsWorld.cars[0].lastDeath.state.y]);
const learnedBeforeClear=deathsWorld.learner.episodes;deathsWorld.clearHistory();assert(deathsWorld.cars.every(c=>c.lastDeath===null));assert.equal(deathsWorld.deaths,0);assert.equal(deathsWorld.learner.episodes,learnedBeforeClear,'Clearing the visual history must retain training records');
const winWorld=new E.FleetWorld(map,new E.VisionLearner(),config,2);winWorld.learner.choose=()=> 'straight';winWorld.cars[0].state={...initial,x:15.8,y:2,carId:0};winWorld.cars[1].state={...initial,x:2,y:8,carId:1};for(const c of winWorld.cars){c.active=true;c.waiting=false;}winWorld.step(1/120,{repeat:false});assert(winWorld.learner.hasCleared);assert(winWorld.cars[1].active,'One car passing must not stop the other cars');
const streamLearner=new E.VisionLearner(),streamA=[],streamB=[];
const independent=new E.FleetLearner(),driverA=independent.forCar(0),driverB=independent.forCar(1);
assert.notEqual(driverA,driverB);assert.notEqual(driverA.q,driverB.q);assert.notEqual(driverA.experience,driverB.experience);
driverA.values(seen)[0]=8;driverB.values(seen)[3]=6;
const otherBefore=JSON.stringify(driverB.serialize());
driverA.learn(seen,'straight',seen,-15,true);
assert.equal(JSON.stringify(driverB.serialize()),otherBefore,'A failed driver must not change another driver’s Q values, replay memories, or counters');
assert.equal(driverB.choose(seen,0),'left','Each car must act from its own policy for the same observation');
const individualWorld=new E.FleetWorld(map,independent,config,2);
assert.equal(individualWorld.cars[0].learner,driverA);assert.equal(individualWorld.cars[1].learner,driverB);
individualWorld.cars[0].state={...initial,x:14.32,carId:0};
driverA.choose=()=> 'straight';
for(let i=0;i<40&&!individualWorld.cars[0].state.done;i++)individualWorld.step(1/120,{manualId:1,repeat:false});
assert(individualWorld.cars[0].state.done);
assert.equal(driverA.episodes,1);assert.equal(driverB.episodes,0);assert.equal(independent.episodes,1,'Fleet totals must count an attempt once while each driver keeps its own count');
assert.equal(JSON.stringify(driverB.serialize()),otherBefore,'Real fleet stepping must send the failed transition only to the responsible car');
const independentReload=new E.FleetLearner(JSON.parse(JSON.stringify(independent.serialize())));
assert.deepEqual(independentReload.forCar(0).serialize(),driverA.serialize());
assert.deepEqual(independentReload.forCar(1).serialize(),driverB.serialize());
assert.notEqual(independentReload.forCar(0).q,independentReload.forCar(1).q);
const resizedFleet=new E.FleetWorld(map,independentReload,config,1);assert.equal(resizedFleet.cars.length,1);
const enlargedFleet=new E.FleetWorld(map,independentReload,config,4);assert.equal(enlargedFleet.cars[1].learner,independentReload.forCar(1),'Temporarily reducing fleet size must retain inactive drivers’ memories');
const legacyPolicy=new E.VisionLearner();legacyPolicy.learn(seen,'left',seen,-15,true);legacyPolicy.record({time:1,won:false,distance:.4});
const migratedFleet=new E.FleetLearner(JSON.parse(JSON.stringify(legacyPolicy.serialize())));
assert.deepEqual(migratedFleet.forCar(0).q,legacyPolicy.q,'Keep old shared learning on car 01 rather than erasing it');
assert.equal(migratedFleet.forCar(0).experience.length,1);
assert.deepEqual(migratedFleet.forCar(1).q,{},'A legacy failing policy must not be cloned into every car');
assert.equal(migratedFleet.forCar(1).memoryLimit,512);assert.equal(migratedFleet.forCar(1).outcomeLimit,64);
streamLearner.learn(seen,'straight',seen,.1,false,streamA);
streamLearner.learn(traffic,'decelerate',seen,-1,true,streamB);
assert.equal(streamA.length,1,'A terminal event for one car must not clear another replay trace');assert.equal(streamB.length,0);
assert.equal(seen.rays.length, 7);
assert.equal(seen.rays[3].distance, 4, 'Straight road should remain visible to the range limit');
assert(seen.rays[0].distance < .4 && seen.rays[6].distance < .4, 'Side rays must detect nearby road edges');
assert(E.sense(map, { ...initial, x: 14.2 }).rays[3].distance < .2, 'Rays must detect the end of a road');
assert(E.sense(map, initial, 2).rays.every(r => r.distance <= 2));
assert(!('x' in seen) && !('y' in seen));
assert(seen.rays.every(r => !('x' in r) && !('y' in r)), 'Policy observations must omit map coordinates');
for (let i = 0; i < 7; i++) {
  const changed = { ...seen, rays: seen.rays.map((r,j) => j === i ? { ...r, distance: .1 } : r) };
  assert.notEqual(E.observationKey(changed), E.observationKey(seen), `Ray ${i} must affect the learning state`);
}
const bridge = E.sense(map, { ...initial, x: 6, y: 5, angle: Math.PI / 2, bridgeLock: { x: 6, y: 5, axis: 'v' } });
assert(bridge.rays[1].distance < .4 && bridge.rays[5].distance < .4, 'Bridge vision must see the current deck guardrails');

const q = new E.VisionLearner(), next = E.sense(map, { ...initial, angle: Math.PI / 2 });
q.q[E.observationKey(next)] = [2, 0, 0, 0, 0];
const before = q.values(seen)[0];
q.learn(seen, 'straight', next, 1, false);
assert(Math.abs(q.values(seen)[0] - (before + .18 * (1 + .98 * 2 - before))) < 1e-10, 'Update must implement the Bellman target');
const terminal = new E.VisionLearner();
terminal.q[E.observationKey(next)] = [100, 100, 100, 100, 100];
terminal.learn(seen, 'left', next, -15, true);
assert(Math.abs(terminal.values(seen)[3] - -.18 * 15) < 1e-10, 'Terminal transitions must not bootstrap');
assert(!('map' in q), 'The policy must not own a map');
// Distinct stopping distances must no longer collapse into the same state.
const nearView={...seen,rays:seen.rays.map((r,i)=>i===3?{...r,distance:.7}:r)};
assert.notEqual(E.observationKey(nearView),E.observationKey(seen),'0.7 units and an open straight are different driving situations');
// A non-greedy deviation must not propagate its terminal penalty into the
// preceding successful prefix. A subsequent greedy choice must avoid it.
const credit=new E.VisionLearner(),creditStream=[];
credit.values(seen)[0]=5;credit.values(next)[0]=2;
credit.learn(seen,'straight',next,.1,false,creditStream);
credit.learn(next,'left',next,-15,true,creditStream);
assert(credit.values(seen)[0]>0,'An exploratory death must retain the useful earlier action');
assert(credit.values(next)[3]<0,'The failing exploratory action itself must receive the penalty');
for(let i=0;i<50;i++)assert.notEqual(credit.choose(next,0),'left','Greedy driving must not repeat a known lower-value fatal action');
assert.equal(creditStream.length,0);
// Experience survives episode boundaries, reset, and JSON round trips, and is
// actually replayed rather than being a display-only counter.
const longMemory=new E.VisionLearner();
longMemory.learn(seen,'left',next,-15,true);longMemory.record({time:1,won:false,distance:.5});
const remembered=new E.VisionLearner(JSON.parse(JSON.stringify(longMemory.serialize())));
assert.equal(remembered.experience.length,1);assert.equal(remembered.outcomes.length,1);
remembered.values(seen)[3]=20;
remembered.learn(next,'straight',next,.1,false);
assert(remembered.values(seen)[3]<20,'A stored earlier-episode failure must be relearned on a later episode');
assert(remembered.replays>=2);
const oldRewards=JSON.parse(JSON.stringify(longMemory.serialize()));
for(const t of [...oldRewards.experience,...oldRewards.outcomes])delete t.rewardVersion;
const oldRewardLearner=new E.VisionLearner(oldRewards),oldPenalty=oldRewardLearner.values(seen)[3],oldReplayCount=oldRewardLearner.replays;
oldRewardLearner.learn(next,'straight',next,.1,false);
assert.equal(oldRewardLearner.values(seen)[3],oldPenalty,'Obsolete low-speed/time-limit rewards must not be replayed after the rules change');
assert.equal(oldRewardLearner.replays,oldReplayCount);assert.equal(oldRewardLearner.experience.length,2,'Keep old memory records and Q values rather than silently clearing the model');
const oldQ=new E.VisionLearner({q:{'1222221:4:2':[7,2,1,0,-1]}});
assert(oldQ.q['1222221:4:2'],'Legacy Q records must remain present rather than being erased');
const migrated=new E.VisionLearner({q:{'1111111:4:2':[7,2,1,0,-1]}});
const legacyView={...seen,goalBearing:0,speed:1,rays:seen.rays.map(r=>({...r,distance:.4,kind:'edge'}))};
assert.deepEqual(migrated.values(legacyView),[7,2,1,0,-1],'New detailed states inherit the prior coarse Q experience');
const environment = new E.VisionEnvironment(map, config);
const slowBefore={...initial,time:60,speed:.01},slowAfter={...slowBefore,x:initial.x+.01,distance:.01,time:61,idleTime:0};
const fastAfter={...slowAfter,speed:2,time:60.01};
// The entire path, future-value discount, and champion score must be spatial:
// changing elapsed time or subdividing the same path cannot change them.
function pathReward(parts,duration){const visited=new Set();let total=0,before={...initial};for(let i=1;i<=parts;i++){const after={...initial,x:initial.x+2*i/parts,distance:2*i/parts,time:duration*i/parts,speed:2/duration};total+=E.rewardFor(map,before,after,visited);before=after;}return {total,visited:[...visited].sort()};}
const quickPath=pathReward(4,1),slowPath=pathReward(400,100);
assert(Math.abs(quickPath.total-slowPath.total)<1e-9,'A slower/subdivided traversal of the same path must earn exactly the same total reward');
assert.deepEqual(quickPath.visited,slowPath.visited,'Fast cars must not skip spatial exploration credit');
assert(Math.abs(E.distanceDiscount(2)-Math.pow(E.distanceDiscount(.005),400))<1e-12,'Discount must compose by distance, independent of action count');
assert.equal(E.distanceDiscount(0),1,'Standing still must not apply an implicit per-frame discount');
const shortSlow={...initial,won:true,distance:8,time:1000},longFast={...initial,won:true,distance:12,time:1};
assert(E.compareScore(E.distanceScore(shortSlow,20,map),E.distanceScore(longFast,20,map))>0,'A shorter successful route must beat a faster longer route');
assert.deepEqual(E.distanceScore(shortSlow,20,map),E.distanceScore({...shortSlow,time:1},20,map),'Time must not break ties in champion selection');
const parked={...initial,speed:0,time:11};
assert.equal(E.rewardFor(map,{...initial,speed:0},parked,new Set()),-.02,'A non-moving action must receive a negative reward without ending the attempt');
assert(!parked.done);assert(!parked.truncated);
const parkedBrake={...parked,action:'decelerate'};
assert.equal(E.rewardFor(map,{...initial,speed:0},parkedBrake,new Set()),-.12,'Braking while already stopped must cost more than another idle action');
assert(!parkedBrake.done,'Negative braking feedback must not restore the removed parking death rule');
const brakingAfter={...initial,x:.1,distance:.1,speed:.8,time:1,action:'decelerate'};
const coastingAfter={...brakingAfter,action:'straight'};
const brakeReward=E.rewardFor(map,initial,brakingAfter,new Set()),coastReward=E.rewardFor(map,initial,coastingAfter,new Set());
assert(Math.abs(coastReward-brakeReward-.04*.2)<1e-10,'Useful moving braking gets a small cost proportional to actual speed reduction');
assert(brakeReward>0,'Making road progress while braking must still earn net progress reward');
for(const elite of [false,true]){
 const group=new E.FleetLearner(),driver=group.forCar(0),stoppedView=E.sense(map,{...initial,speed:0});driver.values(stoppedView)[2]=100;
 if(elite)group.champion={id:0,generation:1,scoreVersion:2,score:[0,0,-99,0],won:false,time:0,distance:0,coverage:0,model:JSON.parse(JSON.stringify(driver.serialize()))};
 const recovery=new E.FleetWorld(map,group,config,1);recovery.cars[0].state.speed=0;
 for(let i=0;i<1200&&recovery.cars[0].state.distance<.02;i++)recovery.step(1/120,{epsilon:0});
 assert(recovery.cars[0].state.distance>=.02,'A high-valued legacy parking/braking policy must learn to leave the start, including an elite driver');
 assert.equal(recovery.cars[0].attempts,1);assert.equal(recovery.deaths,0);
 if(elite)assert.equal(group.champion.model.q[E.policyKey(stoppedView)][2],100,'Negative feedback must update the live elite without overwriting its saved checkpoint');
}
const slowReward=E.rewardFor(map,slowBefore,slowAfter,new Set()),fastReward=E.rewardFor(map,slowBefore,fastAfter,new Set());
assert.equal(slowAfter.done,false,'A car still moving after 45 seconds must not time out');
assert.equal(slowAfter.idleTime,0,'Any actual movement must reset the parking timer regardless of speed');
assert(Math.abs(slowReward-fastReward)<1e-10,'The same progress must not be penalized merely for taking longer or moving more slowly');
const stopAndGo=new E.VisionEnvironment(map,config);stopAndGo.state.speed=0;
for(let i=0;i<135;i++)stopAndGo.step('straight');
assert(!stopAndGo.state.done,'A brief real stop must leave time to accelerate again');
stopAndGo.step('accelerate');assert.equal(stopAndGo.state.idleTime,0);assert(!stopAndGo.state.done);
const trulyStopped=new E.VisionEnvironment(map,config);trulyStopped.state.speed=0;
for(let i=0;i<1800;i++)trulyStopped.step('straight');
assert(trulyStopped.state.time>119);assert(!trulyStopped.state.done);assert.equal(trulyStopped.state.reason,'');
trulyStopped.step('accelerate');assert(trulyStopped.state.x>map.start[0]);assert(!trulyStopped.state.done);
const waitingGroup=new E.FleetLearner(),waitingWorld=new E.FleetWorld(map,waitingGroup,config,1);waitingWorld.cars[0].state.speed=0;waitingWorld.cars[0].learner.choose=()=> 'straight';
for(let i=0;i<14400;i++)waitingWorld.step(1/120);
assert(waitingWorld.cars[0].active);assert(!waitingWorld.cars[0].state.done);assert.equal(waitingWorld.cars[0].attempts,1);assert.equal(waitingWorld.deaths,0);assert.equal(waitingGroup.episodes,0);
const parkedX=waitingWorld.cars[0].state.x;for(let i=0;i<60;i++)waitingWorld.step(1/120,{manualId:0,control:E.CONTROLS.accelerate});
assert(waitingWorld.cars[0].state.x>parkedX);assert.equal(waitingWorld.cars[0].attempts,1,'The same parked attempt must resume rather than respawning');
const stationaryQ=JSON.stringify(waitingWorld.cars[0].learner.q),stationaryEvaluation=E.evaluatePolicy(waitingWorld.cars[0].learner.serialize(),map,{...config,maxSpeed:0});
assert(!stationaryEvaluation.won);assert.equal(JSON.stringify(waitingWorld.cars[0].learner.q),stationaryQ,'Offline evaluation must not kill or modify a live parked car');
// Brake to below the former .18 cutoff, coast, turn through 90 degrees and
// reach the goal well past the former 45-second deadline.
const slowRoads=[];for(let x=1;x<=7;x++)slowRoads.push(`${x},5`);for(let y=2;y<5;y++)slowRoads.push(`7,${y}`);
const slowMap=E.makeMap(3,{width:10,height:8,roads:slowRoads,bridges:[],start:[1,5],goal:[7,2],startDir:0}),slowTurn=new E.VisionEnvironment(slowMap,config);
let turnPhase='brake',slowSteps=0;
while(!slowTurn.state.done&&slowSteps++<4000){const s=slowTurn.state;let action='straight';if(turnPhase==='brake'){if(s.speed>.12)action='decelerate';else turnPhase='approach';}if(turnPhase==='approach'&&s.x>=6.97)turnPhase='turn';if(turnPhase==='turn'){if(s.angle>-Math.PI/2)action='left';else turnPhase='finish';}slowTurn.step(action);}
assert(slowTurn.state.won,'A physically valid low-speed cornering run must be allowed to finish');
assert(slowTurn.state.time>45);assert(slowTurn.state.speed<.18);assert.equal(slowTurn.state.idleTime,0);
let physical = E.continuousInitial(map);
for (let i = 0; i < 8; i++) physical = E.advanceManual(map, physical, E.CONTROLS.accelerate, 1 / 120, config);
environment.step('accelerate');
assert.deepEqual(environment.state, physical, 'Training and visible driving must use the same continuous physics');

const custom = E.serializeMap(map);
custom.roads = custom.roads.filter(k => k !== '7,8');
const erased = E.makeMap(3, custom);
assert(!E.onRoad(erased, 7, 8));
assert(E.sense(erased, { ...initial, x: 5.5 }).rays[3].distance < 1, 'Erasing a road must immediately change the sensors');
assert(E.reference(erased).at(-1).won, 'Optional human reference route should still work');
if(process.argv.includes('--parking-check')||process.argv.includes('--braking-check')){
 console.log('Parking for 120 seconds, no death/respawn/episode reset, acceleration from the same attempt, and non-mutating offline evaluation: passed');
 process.exit(0);
}
Object.defineProperty(map, 'dist', { get() { throw new Error('The driving learner must not access path distances'); } });
let randomDistance = 0;
for (let i = 0; i < 30; i++) {
  const env = new E.VisionEnvironment(map, config);
  while (!env.state.done) env.step(E.ACTIONS[Math.floor(Math.random() * 5)]);
  randomDistance += env.state.distance;
}
const learner = new E.VisionLearner();
let learnedChampion=null;
for (let i = 0; i < 5000; i++){
 learner.episode(map, config, Math.max(.03, .25 / (1 + learner.episodes / 2000)));
 if((i+1)%500===0){const candidate=E.evaluatePolicy(learner.serialize(),map,config);if(!learnedChampion||E.compareScore(candidate.score,learnedChampion.score)>0)learnedChampion=candidate;}
}
const evaluation = new E.VisionEnvironment(map, config);
// Evaluate the retained champion, as the app does, rather than the mutable last
// exploratory policy. No random tie-breaking is used in elite demonstrations.
const retainedPolicy=new E.VisionLearner(learnedChampion.model);
for(let observationBudget=0;observationBudget<20000&&!evaluation.state.done;observationBudget++){const q=retainedPolicy.values(evaluation.observe());evaluation.step(E.ACTIONS[q.indexOf(Math.max(...q))]);}
assert(evaluation.state.distance > randomDistance / 30 * 3, 'The selected trained champion must retain travel beyond the random baseline');
assert.equal(learner.episodes, 5000);
const restored = new E.VisionLearner(JSON.parse(JSON.stringify(learner.serialize())));
assert.deepEqual(restored.values(seen), learner.values(seen));
assert.equal(restored.experience.length,4096,'Across-episode replay must remain bounded');
assert.equal(restored.outcomes.length,512,'Terminal experience must be retained separately within its bound');
assert.equal(restored.transitions,learner.transitions);
assert.equal(restored.replays,learner.replays);
// End-to-end regression: one exploratory road exit must not erase a learned
// straight-track solution, including after saving and restoring the learner.
const previousRandom=Math.random;let straightSeed=543;
Math.random=()=>((straightSeed=(Math.imul(straightSeed,1664525)+1013904223)>>>0)/4294967296);
const straightMap=E.makeMap(3,{width:10,height:7,roads:Array.from({length:8},(_,i)=>`${i+1},3`),bridges:[],start:[1,3],goal:[8,3],startDir:0});
const straightLearner=new E.VisionLearner();
for(let i=0;i<600;i++)straightLearner.episode(straightMap,config,.12);
function verifyStraight(policy){for(let i=0;i<10;i++){const env=new E.VisionEnvironment(straightMap,config);for(let observationBudget=0;observationBudget<20000&&!env.state.done;observationBudget++)env.step(policy.choose(env.observe(),0));assert(env.state.won,'A learned straight-track solution must survive an isolated exploratory death');}}
verifyStraight(straightLearner);
const exploratoryRun=new E.VisionEnvironment(straightMap,config);let exploratoryView=exploratoryRun.observe();
while(!exploratoryRun.state.done){const a=exploratoryRun.state.time<1?'straight':'left',r=exploratoryRun.step(a);straightLearner.learn(exploratoryView,a,r.observation,r.reward,r.done);exploratoryView=r.observation;}
assert.equal(exploratoryRun.state.won,false);assert.equal(exploratoryRun.state.reason,'驶出道路');
verifyStraight(new E.VisionLearner(JSON.parse(JSON.stringify(straightLearner.serialize()))));
// Elite selection must transfer an actually better policy rather than an
// average, the latest failed driver, or the largest training count.
const eliteGroup=new E.FleetLearner();
function badDriver(){const p=new E.VisionLearner({memoryLimit:512,outcomeLimit:64});p.values(E.sense(straightMap,E.continuousInitial(straightMap)))[3]=30;return p;}
for(let id=0;id<4;id++)eliteGroup.drivers.set(id,badDriver());
eliteGroup.drivers.set(1,new E.VisionLearner(JSON.parse(JSON.stringify(straightLearner.serialize()))));
eliteGroup.forCar(0).episodes=1234;
assert(eliteGroup.selectChampion(straightMap,config,4,true));
assert.equal(eliteGroup.champion.id,1,'A proven successful driver must beat failed drivers even when they have more attempts');
assert(eliteGroup.champion.won);
const eliteSnapshot=JSON.stringify(eliteGroup.champion),explorerBefore=eliteGroup.forCar(3);
const follower=eliteGroup.inheritChampion(0,straightMap,config);
assert.equal(follower.episodes,1234,'Learning from the champion must retain the follower’s own attempt statistics');
assert(E.evaluatePolicy(follower.serialize(),straightMap,config).won,'A follower must inherit the successful policy, not an averaged policy');
assert.notEqual(follower.q,eliteGroup.forCar(1).q,'Followers must have their own mutable policy after learning');
assert.equal(eliteGroup.inheritChampion(3,straightMap,config),explorerBefore,'Keep an independent explorer instead of cloning every car');
assert.equal(eliteGroup.sources[0].id,1);
for(let id=0;id<4;id++)eliteGroup.drivers.set(id,badDriver());
assert.equal(eliteGroup.selectChampion(straightMap,config,4,true),false,'A bad later generation must not replace a saved better champion');
assert.equal(JSON.stringify(eliteGroup.champion),eliteSnapshot,'The elite checkpoint must remain independent of subsequent failures');
const eliteReload=new E.FleetLearner(JSON.parse(JSON.stringify(eliteGroup.serialize())));
assert.equal(eliteReload.champion.id,1);assert(eliteReload.champion.won);assert.equal(eliteReload.sources[0].id,1);
assert(E.evaluatePolicy(eliteReload.champion.model,straightMap,config).won,'The saved champion must work after reload');
const eliteDemo=new E.FleetWorld(straightMap,eliteReload,config,4);
for(let i=0;i<1800&&!eliteDemo.cars[1].state.done;i++)eliteDemo.step(1/120,{epsilon:1,repeat:false});
assert(eliteDemo.cars[1].state.won,'The champion source car must reproduce the saved solution in a visible fleet even while other cars explore');
assert.equal(eliteDemo.cars[1].lastExploratory,false,'The elite demonstration must not randomly discard its saved strategy');
Math.random=previousRandom;
const app = fs.readFileSync('./dist/app.js', 'utf8');
assert(!app.includes('E.plan(') && !app.includes('E.samplePath('), 'Visible AI must not follow a scripted trajectory');
console.log('Seven-ray vision, bridge layers, erasure, Bellman updates, continuous physics and persistence: passed');
console.log(`Random baseline: ${(randomDistance / 30).toFixed(2)} units; sensor-trained policy: ${evaluation.state.distance.toFixed(2)} units`);
console.log(`Reached exit in this evaluation: ${evaluation.state.won}. This test does not claim all tracks are solved.`);
