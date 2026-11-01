const assert = require('node:assert/strict');
const E = require('./dist/engine.js');
let seed = 19656;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const config = { maxSpeed: 8, acceleration: 2, steering: 3 };
const map = E.makeMap(0);
let car = E.continuousInitial(map);
car = E.advanceManual(map, car, { throttle: 1, brake: 0, steer: 0 }, 1 / 120, config);
assert(car.x > 0 && car.x < .02, 'Movement must occur inside the first cell');
assert(car.speed > 1 && car.speed < 1.02, 'Throttle must change speed continuously');
const coasting = E.advanceManual(map, car, { throttle: 0, brake: 0, steer: 0 }, 1 / 120, config);
assert.equal(coasting.speed, car.speed, 'Releasing throttle preserves speed');
for (const steer of [-1, 1]) {
  const turned = E.advanceManual(map, { ...car, x: 4, y: 8, speed: 6 }, { throttle: 0, brake: 0, steer }, 1 / 120, config);
  assert.equal(turned.done, false, 'High speed must not prohibit turning');
  assert.equal(Math.sign(turned.angle), steer);
}
const stopped = E.advanceManual(map, { ...car, speed: 0 }, { throttle: 0, brake: 1, steer: 0 }, 1 / 120, config);
assert.equal(stopped.speed, 0);
assert.equal(stopped.x, car.x);
assert.equal(E.transition(map, { ...E.initial(map), x: 4, y: 8, v: 3 }, 'left').state.done, false);
assert.equal(E.transition(map, { ...E.initial(map), x: 6, y: 5 }, 'left').state.done, true, 'Bridge decks stay disconnected');
for (let index = 0; index < 3; index++) {
  const track = E.makeMap(index), learner = new E.Learner(track);
  for (let n = 0; n < 500; n++) learner.episode(.25);
  for (let n = 0; n < 30; n++) {
    const plan = E.plan(track, learner);
    assert(plan.final.won, 'Learned route must reach the exit');
    const path = E.smoothPath(plan.points);
    assert(path.every(p => E.onRoad(track, p.x, p.y)), 'Rounded corners must remain on the road');
    let previous = E.samplePath(path, 0), cursor = 0;
    for (let d = .015; d < path.at(-1).distance; d += .015) {
      const p = E.samplePath(path, d, cursor);cursor = p.index;
      assert(Math.hypot(p.x - previous.x, p.y - previous.y) < .018, 'Position must remain continuous');
      const turn = Math.atan2(Math.sin(p.angle - previous.angle), Math.cos(p.angle - previous.angle));
      assert(Math.abs(turn) < .3, 'Heading must turn smoothly rather than snap by 90 degrees');
      previous = p;
    }
  }
  console.log(`Map ${index}: 30 successful learned routes, continuous positions and headings`);
}
const custom = E.serializeMap(map);
custom.roads = custom.roads.filter(k => k !== '7,8');
const erased = E.makeMap(3, custom);
assert(!erased.roads.has('7,8'));
assert(!E.onRoad(erased, 7, 8), 'Erasing a road removes its driveable surface');
assert(!erased.segments.some(([x1,y1,x2,y2]) => x1 === 7 && y1 === 8 || x2 === 7 && y2 === 8));
assert(E.reference(erased).at(-1).won, 'Alternate route stays reachable after erasing');
console.log('Continuous throttle, coasting, braking, unrestricted turns, bridges and erasure: passed');
