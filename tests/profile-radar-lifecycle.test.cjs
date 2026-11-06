const test = require('node:test');
const assert = require('node:assert/strict');

let definition;
const originalComponent = global.Component;
global.Component = value => { definition = value; };
delete require.cache[require.resolve('../packages/reports/components/profile-radar/index.js')];
require('../packages/reports/components/profile-radar/index.js');
global.Component = originalComponent;

const dimensions = values => values.map((percent, index) => ({ id: `d${index}`, percent }));
const nextTimer = () => new Promise(resolve => setTimeout(resolve, 5));

function createContext() {
  const noop = () => {};
  return {
    scale: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    closePath: noop, fill: noop, stroke: noop, arc: noop,
    createLinearGradient() { return { addColorStop: noop }; }
  };
}

function createInstance(values = [20, 50, 80, 35, 65]) {
  const callbacks = [];
  let contexts = 0;
  const instance = {
    data: { dimensions: dimensions(values) },
    createSelectorQuery() {
      const query = {
        select() { return query; },
        fields() { return query; },
        exec(callback) { callbacks.push(callback); }
      };
      return query;
    }
  };
  Object.assign(instance, definition.methods);
  const field = () => [{
    width: 300,
    height: 300,
    node: {
      getContext() { contexts += 1; return createContext(); }
    }
  }];
  return { instance, callbacks, field, contexts: () => contexts };
}

test('detaching invalidates a selector callback that is already in flight', async () => {
  const env = createInstance();
  const originalWx = global.wx;
  global.wx = { getWindowInfo: () => ({ pixelRatio: 2 }) };
  try {
    definition.lifetimes.ready.call(env.instance);
    await nextTimer();
    assert.equal(env.callbacks.length, 1);
    definition.lifetimes.detached.call(env.instance);
    env.callbacks[0](env.field());
    assert.equal(env.contexts(), 0);
  } finally { global.wx = originalWx; }
});

test('a newer dimensions request invalidates the previous canvas callback', async () => {
  const env = createInstance();
  const originalWx = global.wx;
  global.wx = { getWindowInfo: () => ({ pixelRatio: 1 }) };
  try {
    definition.lifetimes.ready.call(env.instance);
    await nextTimer();
    env.instance.data.dimensions = dimensions([90, 70, 45, 25, 60]);
    env.instance.queueDraw();
    await nextTimer();
    assert.equal(env.callbacks.length, 2);
    env.callbacks[0](env.field());
    assert.equal(env.contexts(), 0);
    env.callbacks[1](env.field());
    assert.equal(env.contexts(), 1);
  } finally { global.wx = originalWx; }
});

test('unchanged dimensions do not schedule another canvas draw', async () => {
  const env = createInstance();
  const originalWx = global.wx;
  global.wx = { getWindowInfo: () => ({ pixelRatio: 1 }) };
  try {
    definition.lifetimes.ready.call(env.instance);
    await nextTimer();
    env.callbacks[0](env.field());
    env.instance.queueDraw();
    await nextTimer();
    assert.equal(env.callbacks.length, 1);
    assert.equal(env.contexts(), 1);
  } finally { global.wx = originalWx; }
});
