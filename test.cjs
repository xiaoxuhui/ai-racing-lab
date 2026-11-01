const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('./dist/engine.js');
require('./dist/vision.js');
let seed = 19656;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const config = { maxSpeed: 8, acceleration: 2, steering: 3 }, map = E.makeMap(0);
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
const environment = new E.VisionEnvironment(map, config);
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
Object.defineProperty(map, 'dist', { get() { throw new Error('The driving learner must not access path distances'); } });
let randomDistance = 0;
for (let i = 0; i < 30; i++) {
  const env = new E.VisionEnvironment(map, config);
  while (!env.state.done) env.step(E.ACTIONS[Math.floor(Math.random() * 5)]);
  randomDistance += env.state.distance;
}
const learner = new E.VisionLearner();
for (let i = 0; i < 5000; i++) learner.episode(map, config, Math.max(.03, .25 / (1 + learner.episodes / 2000)));
const evaluation = new E.VisionEnvironment(map, config);
while (!evaluation.state.done) evaluation.step(learner.choose(evaluation.observe(), 0));
assert(evaluation.state.distance > randomDistance / 30 * 3, 'Learning must improve travel beyond the random baseline');
assert.equal(learner.episodes, 5000);
const restored = new E.VisionLearner(JSON.parse(JSON.stringify(learner.serialize())));
assert.deepEqual(restored.values(seen), learner.values(seen));
const app = fs.readFileSync('./dist/app.js', 'utf8');
assert(!app.includes('E.plan(') && !app.includes('E.samplePath('), 'Visible AI must not follow a scripted trajectory');
console.log('Seven-ray vision, bridge layers, erasure, Bellman updates, continuous physics and persistence: passed');
console.log(`Random baseline: ${(randomDistance / 30).toFixed(2)} units; sensor-trained policy: ${evaluation.state.distance.toFixed(2)} units`);
console.log(`Reached exit in this evaluation: ${evaluation.state.won}. This test does not claim all tracks are solved.`);
