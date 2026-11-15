const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const file = path.resolve(__dirname, '../pages/my-tree/index.js');
const nativeRequire = createRequire(file);

function fixture(imageMode = 'ready') {
  const timers = new Map(), draws = [], previews = [], toasts = [], exports = [], texts = [];
  const images = [];
  const environment = { exportFails: false, exportPending: false };
  const gradient = { addColorStop() {} };
  const context = {
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    fillRect() {}, beginPath() {}, arc() {}, ellipse() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
    measureText: text => ({ width: String(text).length * 20 }),
    fillText(text) { texts.push(text); },
    drawImage(...values) { draws.push(values); }
  };
  const canvas = {
    getContext: () => context,
    createImage() {
      const image = { width: 1440, height: 720 };
      Object.defineProperty(image, 'src', { set(value) {
        image.source = value;
        image.lateLoad = image.onload;
        image.lateError = image.onerror;
        if (imageMode === 'ready') queueMicrotask(() => image.lateLoad());
        if (imageMode === 'error') queueMicrotask(() => image.lateError());
      } });
      images.push(image);
      return image;
    }
  };
  const wx = {
    createSelectorQuery: () => ({ select() { return this; }, fields() { return this; }, exec(callback) { callback([{ node: canvas }]); } }),
    canvasToTempFilePath(options) {
      exports.push(options);
      if (environment.exportPending) return;
      if (environment.exportFails) options.fail(new Error('export unavailable'));
      else options.success({ tempFilePath: '/tmp/tree-poster.png' });
    },
    previewImage(options) { previews.push(options); },
    showToast(options) { toasts.push(options); }
  };
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, wx, console,
    require: nativeRequire,
    setTimeout(callback, delay) { const key = Symbol(); timers.set(key, { callback, delay }); return key; },
    clearTimeout(key) { timers.delete(key); }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = changes => Object.assign(page.data, changes);
  page.onLoad({});
  page.data.current = { ...nativeRequire('../../data/themes.js').getTheme('adventurer'), unlocked: true, discovered: true };
  page.data.heroUrl = 'https://cloud.example/adventurer.webp';
  return { page, canvas, timers, images, draws, previews, toasts, exports, texts, environment };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('tree poster bounds remote image wait and exports a native drawn fallback after timeout', async () => {
  const env = fixture('pending');
  const pending = env.page.createPoster();
  await settle();
  assert.equal(env.page.data.posterBusy, true);
  assert.equal(env.timers.size, 1);
  const [timer] = env.timers.values();
  assert.equal(timer.delay, 8000);
  timer.callback();
  await pending;
  assert.equal(env.page.data.posterBusy, false);
  assert.equal(env.timers.size, 0);
  assert.equal(env.draws.length, 0);
  assert.equal(env.previews.length, 1);
  assert.ok(env.texts.includes('柔软的冒险家'));
  assert.equal(env.images[0].onload, null);
  assert.equal(env.images[0].onerror, null);
  env.images[0].lateLoad();
  assert.equal(env.exports.length, 1, 'late image completion cannot export a second poster');
});

test('leaving the tree cancels its image timeout and ignores saved late callbacks', async () => {
  for (const lifecycle of ['onHide', 'onUnload']) {
    const env = fixture('pending');
    const pending = env.page.createPoster();
    await settle();
    const image = env.images[0];
    env.page[lifecycle]();
    await pending;
    assert.equal(env.timers.size, 0);
    assert.equal(env.page._posterImageCancel, null);
    image.lateLoad(); image.lateError();
    await settle();
    assert.equal(env.exports.length, 0, `${lifecycle} must stop before exporting`);
    assert.equal(env.previews.length, 0);
    assert.equal(env.toasts.length, 0);
  }
});

test('a loaded remote image is contained completely and duplicate taps coalesce', async () => {
  const env = fixture();
  const pending = env.page.createPoster();
  await env.page.createPoster();
  await pending;
  assert.equal(env.images.length, 1);
  assert.equal(env.canvas.width, 750);
  assert.equal(env.canvas.height, 1200);
  const [image, x, y, width, height] = env.draws[0];
  assert.equal(width / height, image.width / image.height);
  assert.ok(x >= 45 && x + width <= 705);
  assert.ok(y >= 100 && y + height <= 760);
  assert.equal(env.timers.size, 0);
  assert.equal(env.previews.length, 1);
  assert.equal(env.page.data.posterBusy, false);
});

test('export failure clears the busy state and an explicit retry succeeds', async () => {
  const env = fixture();
  env.environment.exportFails = true;
  await env.page.createPoster();
  assert.equal(env.page.data.posterBusy, false);
  assert.equal(env.toasts.length, 1);
  assert.equal(env.previews.length, 0);
  env.environment.exportFails = false;
  await env.page.createPoster();
  assert.equal(env.exports.length, 2);
  assert.equal(env.previews.length, 1);
  assert.equal(env.timers.size, 0);
});

test('an export returning after unload never opens image preview', async () => {
  const env = fixture();
  env.environment.exportPending = true;
  const pending = env.page.createPoster();
  await settle();
  assert.equal(env.exports.length, 1);
  env.page.onUnload();
  env.exports[0].success({ tempFilePath: '/tmp/late-tree-poster.png' });
  await pending;
  assert.equal(env.previews.length, 0);
  assert.equal(env.toasts.length, 0);
  assert.equal(env.timers.size, 0);
});
