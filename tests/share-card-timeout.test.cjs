const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode = 'pending') {
  const timers = new Map();
  const image = { width: 900, height: 1200 };
  let exportCount = 0;
  Object.defineProperty(image, 'src', { set() {
    if (mode === 'throw') throw new Error('bad source');
    if (mode === 'invalid') { image.width = 0; image.height = 0; queueMicrotask(() => image.onload()); }
  } });
  const canvas = { createImage: () => image, getContext: () => ({
    createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillText() {}, drawImage() {},
    measureText: value => ({ width: String(value).length * 12 })
  }) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../utils/share-card.js'), 'utf8'), {
    module, exports: module.exports,
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    wx: {
      createSelectorQuery: () => ({ in() { return this; }, select() { return this; }, fields() { return this; }, exec(callback) { callback([{ node: canvas }]); } }),
      canvasToTempFilePath(options) { exportCount++; options.success({ tempFilePath: '/tmp/share.jpg' }); }
    }
  });
  return { ...module.exports, image, timers, exports: () => exportCount };
}

test('background theme-share generation stops waiting for a stalled image after eight seconds', async () => {
  const env = fixture();
  const pending = env.buildShareCard({}, { heroUrl: 'https://cloud.example/stalled.webp' });
  await Promise.resolve();
  const lateLoad = env.image.onload;
  const [timer] = env.timers.values();
  assert.equal(timer.delay, 8000);
  const rejected = assert.rejects(pending, /加载超时/);
  timer.callback(); await rejected;
  assert.equal(env.timers.size, 0);
  assert.equal(env.image.onload, null);
  lateLoad();
  assert.equal(env.exports(), 0);
});

test('image errors, invalid dimensions and source failures clear timeout resources', async () => {
  for (const mode of ['pending', 'invalid', 'throw']) {
    const env = fixture(mode);
    const pending = env.buildShareCard({}, { heroUrl: 'https://cloud.example/bad.webp' });
    const rejected = assert.rejects(pending);
    await Promise.resolve();
    if (mode === 'pending') env.image.onerror();
    await rejected;
    assert.equal(env.timers.size, 0);
    assert.equal(env.image.onerror, null);
    assert.equal(env.exports(), 0);
  }
});
