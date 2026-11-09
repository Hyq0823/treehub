const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

let definition;
const originalComponent = global.Component;
global.Component = value => { definition = value; };
delete require.cache[require.resolve('../components/ranking-board/index.js')];
require('../components/ranking-board/index.js');
global.Component = originalComponent;

function instance(overrides = {}) {
  const events = [];
  const value = {
    data: Object.assign({
      items: [{ id: 'a' }, { id: 'b' }], selectedItems: [], completed: false,
      disabled: false, canGoBack: false, canGoForward: false, error: ''
    }, overrides),
    triggerEvent(name, detail) { events.push({ name, detail }); }
  };
  Object.assign(value, definition.methods);
  return { value, events };
}

test('ranking board emits compact intent events and blocks cards after completion', () => {
  const active = instance();
  active.value.choose({ currentTarget: { dataset: { index: 1 } } });
  assert.deepEqual(active.events, [{ name: 'change', detail: { index: 1 } }]);
  const complete = instance({ completed: true });
  complete.value.choose({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(complete.events.length, 0);
});

test('ranking controls expose undo, reset, round navigation and retry only when available', () => {
  const active = instance({
    selectedItems: [{ id: 'a' }], canGoBack: true, canGoForward: true, error: 'retry'
  });
  active.value.undo(); active.value.reset(); active.value.back(); active.value.forward(); active.value.retry();
  assert.deepEqual(active.events.map(item => item.name), ['undo', 'reset', 'back', 'forward', 'retry']);
  const disabled = instance({ disabled: true, selectedItems: [{ id: 'a' }], canGoBack: true, canGoForward: true, error: 'retry' });
  disabled.value.undo(); disabled.value.reset(); disabled.value.back(); disabled.value.forward(); disabled.value.retry();
  assert.equal(disabled.events.length, 0);
});

test('ranking interaction never invokes device vibration', () => {
  const source = fs.readFileSync(require.resolve('../components/ranking-board/index.js'), 'utf8');
  assert.doesNotMatch(source, /vibrate/i);
});
