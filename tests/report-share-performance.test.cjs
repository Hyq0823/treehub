const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const pagePath = path.resolve(__dirname, '../packages/reports/index.js');

function loadPage(build = async count => `/tmp/share-${count}.png`) {
  let page;
  let builds = 0;
  let timerId = 0;
  const timers = new Map();
  const nativeRequire = createRequire(pagePath);
  const wx = { switchTab() {} };
  vm.runInNewContext(fs.readFileSync(pagePath, 'utf8'), {
    Page(value) { page = value; },
    wx,
    console,
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id.endsWith('/share-card.js')) {
        return {
          DEFAULT_SHARE_IMAGE: '/assets/share-cover.webp',
          async buildShareCard() { builds++; return build(builds); }
        };
      }
      return nativeRequire(id);
    }
  }, { filename: pagePath });
  page.data = structuredClone(page.data);
  page.setData = value => Object.assign(page.data, value);
  page._disposed = false;
  page._starterShareCache = Object.create(null);
  page.data.starterReveal = true;
  page.data.starterThemeId = 'adventurer';
  return { page, timers, builds: () => builds };
}

const theme = {
  id: 'adventurer', name: '柔软的冒险家', quote: '慢慢走，也是在向前',
  pale: '#e9f5ff', color: '#318aff'
};

test('starter share Canvas stays out of the report first paint and caches its result', async () => {
  const env = loadPage();
  env.page.scheduleStarterShare(theme, 'https://cloud.example/adventurer.webp');
  assert.equal(env.builds(), 0);
  assert.equal(env.timers.size, 1);
  const pending = [...env.timers.values()][0];
  assert.equal(pending.delay, 1500);
  env.timers.clear();
  pending.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.builds(), 1);
  assert.equal(env.page.data.starterShareImage, '/tmp/share-1.png');

  env.page.scheduleStarterShare(theme, 'https://cloud.example/adventurer.webp');
  assert.equal(env.timers.size, 0);
  assert.equal(env.builds(), 1);
});

test('leaving the report cancels deferred Canvas work', async () => {
  const env = loadPage();
  env.page.scheduleStarterShare(theme, 'https://cloud.example/adventurer.webp');
  const callback = [...env.timers.values()][0].callback;
  env.page.onUnload();
  assert.equal(env.timers.size, 0);
  callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.builds(), 0);
  assert.equal(env.page.data.starterShareImage, '/assets/share-cover.webp');
});

test('closing the starter reveal invalidates Canvas work already in flight', async () => {
  let finish;
  const env = loadPage(() => new Promise(resolve => { finish = resolve; }));
  const rendering = env.page.prepareStarterShare(theme, 'https://cloud.example/adventurer.webp');
  env.page.closeStarterReveal();
  finish('/tmp/late-share.png');
  await rendering;
  assert.equal(env.page.data.starterReveal, false);
  assert.equal(env.page.data.starterShareImage, '/assets/share-cover.webp');
});
