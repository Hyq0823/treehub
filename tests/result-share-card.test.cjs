const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');

function canvasFixture(imageMode = 'ready', failExport = false) {
  const timers = new Map();
  const texts = [], draws = [], requests = [], exports = [];
  const context = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
    fillText(text, x, y) { texts.push({ text, x, y }); },
    measureText: text => ({ width: Array.from(String(text)).length * 13 }),
    drawImage(...args) { draws.push(args); }
  };
  const canvas = {
    getContext: () => context,
    createImage() {
      const image = { width: 1440, height: 720 };
      Object.defineProperty(image, 'src', { set(source) {
        requests.push(source);
        if (imageMode !== 'pending') queueMicrotask(() => imageMode === 'ready' ? image.onload() : image.onerror());
      } });
      return image;
    }
  };
  const wx = {
    createSelectorQuery: () => ({
      in() { return this; }, select() { return this; }, fields() { return this; },
      exec(callback) { callback([{ node: canvas }]); }
    }),
    canvasToTempFilePath(options) {
      exports.push(options);
      if (failExport) options.fail(new Error('export failed'));
      else options.success({ tempFilePath: '/tmp/personal-card.jpg' });
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'packages/reports/result-share-card.js'), 'utf8'), {
    module, exports: module.exports, wx,
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  return { builder: module.exports.buildResultShareCard, timers, texts, draws, requests, exports };
}

const options = {
  title: '慢热靠近者', testName: '亲密相处节奏', tagline: '不催自己靠近，也把心意藏到看不见。',
  date: '2026.11.15', themeName: '慢热的浪漫家', mode: 'profile',
  dimensions: [
    { id: 'contact', label: '联络需要', percent: 67 },
    { id: 'space', label: '个人空间', percent: 33 }
  ]
};

test('personal result JPEG is 5:4 and fits the complete remote artwork beside its summary chart', async () => {
  const env = canvasFixture();
  const result = await env.builder({}, { ...options, heroUrl: 'https://cloud.example/theme.webp' });
  assert.equal(result.path, '/tmp/personal-card.jpg');
  assert.equal(result.artFallback, false);
  assert.equal(env.exports[0].destWidth, 500);
  assert.equal(env.exports[0].destHeight, 400);
  assert.equal(env.exports[0].width / env.exports[0].height, 5 / 4);
  assert.equal(env.requests.length, 1);
  const [image, x, y, width, height] = env.draws[0];
  assert.equal(width / height, image.width / image.height);
  assert.ok(x >= 320 && x + width <= 470);
  assert.ok(y >= 183 && y + height <= 335);
  assert.ok(env.texts.some(item => item.text === '慢热靠近者'));
  assert.ok(env.texts.some(item => item.text === '本次自评位置'));
  assert.ok(env.texts.some(item => item.text === '联络需要'));
  assert.equal(env.timers.size, 0);
});

test('no remote art still yields a personal card and artwork errors use a lightweight drawn tree', async () => {
  const noImage = canvasFixture();
  assert.equal((await noImage.builder({}, options)).path, '/tmp/personal-card.jpg');
  assert.equal(noImage.requests.length, 0);
  const failed = canvasFixture('error');
  const result = await failed.builder({}, { ...options, heroUrl: 'https://cloud.example/unavailable.webp' });
  assert.equal(result.path, '/tmp/personal-card.jpg');
  assert.equal(result.artFallback, true);
  assert.equal(failed.draws.length, 0);
  assert.equal(failed.timers.size, 0);
});

test('stalled remote art times out and exports a usable fallback instead of leaving loading active', async () => {
  const env = canvasFixture('pending');
  const pending = env.builder({}, { ...options, heroUrl: 'https://cloud.example/stalled.webp' });
  await Promise.resolve();
  const timer = [...env.timers.values()][0];
  assert.equal(timer.delay, 8000);
  timer.callback();
  const result = await pending;
  assert.equal(result.artFallback, true);
  assert.equal(result.path, '/tmp/personal-card.jpg');
});

test('Canvas export failure rejects with a retryable message', async () => {
  const env = canvasFixture('ready', true);
  await assert.rejects(env.builder({}, options), /再试一次/);
});

function pageFixture(build) {
  const file = path.join(root, 'packages/reports/index.js');
  const nativeRequire = createRequire(file);
  const previews = [], requested = [], captures = [];
  let page;
  const record = { id: 'private-record', testId: 'ie', testVersion: '1', scoringVersion: '2', scores: { EI: 0 }, resultType: 'I', completedAt: '2026-11-15T00:00:00Z' };
  const wx = { previewImage(value) { previews.push(value); } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, wx, console, setTimeout, clearTimeout,
    require(id) {
      requested.push(id);
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id === '../../utils/archive.js') return { getRecord: () => record, getLatest: () => record, getRecords: () => [record] };
      if (id === './premium-access.js') return { getPendingGrant: () => null };
      if (id === '../../utils/themes.js') return { getState: () => ({ starterClaimed: true, uniqueCount: 1, catalog: [] }) };
      if (id === './result-share-card.js') return { buildResultShareCard(_page, snapshot) {
        captures.push(snapshot);
        return build ? build(snapshot) : Promise.resolve({ path: '/tmp/private-summary.jpg', artFallback: false });
      } };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = data => Object.assign(page.data, data);
  page._disposed = false;
  function ready() {
    Object.assign(page.data, {
      state: 'ready', test: { id: 'relationshiprhythm', name: '亲密相处节奏' },
      record: { id: 'private-record', lifeContext: 'breakup' },
      result: { title: '慢热靠近者', tagline: '给彼此一点空间。' },
      themeId: 'romantic', themeHeroUrl: 'https://cloud.example/romantic.webp', themeName: '慢热的浪漫家',
      profileMode: true, profileDimensions: options.dimensions,
      deepReport: { dimensions: [{ id: 'secret', label: '深度内容', percent: 99 }] }
    });
  }
  return { page, previews, captures, requested, ready };
}

test('report first paint does not load personal Canvas drawing code or create a result card', () => {
  const env = pageFixture();
  env.page.onLoad({ id: 'ie', recordId: 'private-record' });
  assert.equal(env.page.data.state, 'ready');
  assert.equal(env.captures.length, 0);
  assert.equal(env.requested.includes('./result-share-card.js'), false);
  assert.equal(env.requested.includes('../../utils/answer-drafts.js'), false);
  env.page.onUnload();
});

test('personal card generation is explicit, cached and independent of the VIP unlock state', async () => {
  const env = pageFixture(); env.ready();
  assert.equal(env.captures.length, 0);
  await env.page.prepareResultShareCard();
  assert.equal(env.captures.length, 1);
  assert.equal(env.captures[0].dimensions.length, 2);
  assert.equal(env.captures[0].dimensions.some(item => item.id === 'secret'), false);
  env.page.data.premiumUnlocked = true;
  await env.page.prepareResultShareCard();
  assert.equal(env.captures.length, 1, 'unlocking VIP must not reveal additional private dimensions in the existing free card');
  env.page.previewResultShareCard();
  assert.equal(env.previews[0].current, '/tmp/private-summary.jpg');
  const shared = env.page.onShareAppMessage();
  assert.equal(shared.imageUrl, '/tmp/private-summary.jpg');
  assert.equal(shared.path, '/pages/test-detail/index?id=relationshiprhythm');
  assert.doesNotMatch(shared.path, /private-record|breakup|scores|answers/);
});

test('repeat taps coalesce and a changed record or theme cannot receive a late card or preview', async () => {
  for (const change of ['record', 'theme', 'url', 'unload']) {
    let finish;
    const env = pageFixture(() => new Promise(resolve => { finish = resolve; })); env.ready();
    const pending = env.page.prepareResultShareCard();
    await env.page.prepareResultShareCard();
    assert.equal(env.captures.length, 1);
    if (change === 'record') env.page.data.record = { id: 'another-private-record' };
    if (change === 'theme') env.page.data.themeId = 'observer';
    if (change === 'url') env.page.data.themeHeroUrl = 'https://cloud.example/new.webp';
    if (change === 'unload') env.page.onUnload();
    finish({ path: '/tmp/late-private-card.jpg', artFallback: false });
    await pending;
    assert.equal(env.page.data.resultShareImage, '', change);
    env.page.previewResultShareCard();
    assert.equal(env.previews.length, 0, change);
    if (change !== 'unload') assert.equal(env.page.data.resultShareBusy, false);
  }
});

test('failed generation exposes retry state and a later successful attempt becomes shareable', async () => {
  let fail = true;
  const env = pageFixture(() => fail ? Promise.reject(new Error('请重新制作'))
    : Promise.resolve({ path: '/tmp/retried-card.jpg', artFallback: true })); env.ready();
  await env.page.prepareResultShareCard();
  assert.equal(env.page.data.resultShareBusy, false);
  assert.match(env.page.data.resultShareError, /重新制作/);
  fail = false;
  await env.page.prepareResultShareCard();
  assert.equal(env.page.data.resultShareImage, '/tmp/retried-card.jpg');
  assert.match(env.page.data.resultShareNote, /简洁树形/);
});

test('late theme artwork refresh explains why a captured card must be remade', async () => {
  let finish;
  const env = pageFixture(() => new Promise(resolve => { finish = resolve; })); env.ready();
  env.page.refreshResultShareContext();
  assert.equal(env.page.data.resultShareNote, '');
  const pending = env.page.prepareResultShareCard();
  env.page.data.themeHeroUrl = 'https://cloud.example/updated.webp';
  env.page.refreshResultShareContext();
  assert.match(env.page.data.resultShareNote, /主题画面已更新/);
  assert.equal(env.page.data.resultShareBusy, false);
  finish({ path: '/tmp/outdated-tree-card.jpg', artFallback: false });
  await pending;
  assert.equal(env.page.data.resultShareImage, '');
});

test('portrait JPEG is 3:4 with all free dimensions and fully contained remote theme artwork', async () => {
  const env = canvasFixture();
  const dimensions = Array.from({ length: 5 }, (_, index) => ({ id: String(index), label: `自由维度${index + 1}`, percent: index * 25 }));
  await env.builder({}, { ...options, format: 'portrait', heroUrl: 'https://cloud.example/theme.webp', dimensions });
  const output = env.exports[0];
  assert.equal(output.destWidth, 750);
  assert.equal(output.destHeight, 1000);
  assert.equal(output.width / output.height, 3 / 4);
  const [image, x, y, width, height] = env.draws[0];
  assert.equal(width / height, image.width / image.height);
  assert.ok(x >= 70 && x + width <= 680);
  assert.ok(y >= 315 && y + height <= 565);
  for (const dimension of dimensions) assert.ok(env.texts.some(item => item.text === dimension.label));
  assert.ok(env.texts.some(item => item.text === '本次自评 · 不代表能力或人群排名'));
  assert.ok(env.texts.every(item => item.y >= 0 && item.y <= 980));
});

test('portrait artwork failure and keyword-only reports remain exportable without new network sources', async () => {
  const env = canvasFixture('error');
  const result = await env.builder({}, { ...options, format: 'portrait', dimensions: [], keywords: ['慢慢靠近', '认真倾听'], heroUrl: 'https://cloud.example/theme.webp' });
  assert.equal(result.artFallback, true);
  assert.equal(env.requests.length, 1);
  assert.ok(env.texts.some(item => item.text === '慢慢靠近'));
  assert.equal(env.exports[0].destHeight, 1000);
});

function formatEvent(format, force = false) { return { currentTarget: { dataset: { format, force } } }; }

test('format selection does no drawing and portrait cache never becomes the chat share image', async () => {
  const env = pageFixture(snapshot => Promise.resolve({ path: `/tmp/${snapshot.format}.jpg`, artFallback: false })); env.ready();
  env.page.selectResultShareFormat(formatEvent('portrait'));
  assert.equal(env.captures.length, 0);
  assert.equal(env.page.data.resultShareFormat, 'portrait');
  await env.page.prepareResultShareCard();
  assert.equal(env.captures.length, 1);
  assert.equal(env.captures[0].format, 'portrait');
  assert.equal(env.page.data.resultShareImage, '/tmp/portrait.jpg');
  assert.equal(env.page.data.resultShareChatReady, false);
  assert.notEqual(env.page.onShareAppMessage().imageUrl, '/tmp/portrait.jpg');
  env.page.previewResultShareCard();
  assert.equal(env.previews[0].current, '/tmp/portrait.jpg');
  await env.page.prepareResultShareCard(formatEvent('chat'));
  assert.equal(env.page.data.resultShareFormat, 'chat');
  assert.equal(env.page.data.resultShareChatReady, true);
  assert.equal(env.page.onShareAppMessage().imageUrl, '/tmp/chat.jpg');
  env.page.selectResultShareFormat(formatEvent('portrait'));
  assert.equal(env.page.data.resultShareImage, '/tmp/portrait.jpg');
  await env.page.prepareResultShareCard();
  assert.equal(env.captures.length, 2, 'switching back reuses the format-specific card');
  assert.equal(env.page.onShareAppMessage().imageUrl, '/tmp/chat.jpg', 'even while portrait preview is selected, chat remains 5:4');
});

test('portrait failures are retryable and stale portrait exports never enter the format cache', async () => {
  let fail = true;
  const env = pageFixture(snapshot => fail ? Promise.reject(new Error('导出失败，请重试'))
    : Promise.resolve({ path: `/tmp/${snapshot.format}.jpg`, artFallback: false })); env.ready();
  env.page.selectResultShareFormat(formatEvent('portrait'));
  await env.page.prepareResultShareCard();
  assert.equal(env.page.data.resultShareBusy, false);
  assert.match(env.page.data.resultShareError, /请重试/);
  fail = false;
  await env.page.prepareResultShareCard();
  assert.equal(env.page.data.resultShareImage, '/tmp/portrait.jpg');
  let finish;
  const stale = pageFixture(() => new Promise(resolve => { finish = resolve; })); stale.ready();
  stale.page.selectResultShareFormat(formatEvent('portrait'));
  const pending = stale.page.prepareResultShareCard();
  stale.page.selectResultShareFormat(formatEvent('chat'));
  assert.equal(stale.page.data.resultShareFormat, 'portrait', 'busy native Canvas cannot be assigned two simultaneous formats');
  stale.page.data.themeHeroUrl = 'https://cloud.example/updated.webp';
  stale.page.refreshResultShareContext();
  finish({ path: '/tmp/outdated-portrait.jpg', artFallback: false });
  await pending;
  stale.page.previewResultShareCard();
  assert.equal(stale.previews.length, 0);
  assert.equal(stale.page.data.resultShareImage, '');
  assert.equal(stale.page.data.resultShareChatReady, false);
});

test('format caches stay bounded across changed themes without retaining shareable stale contexts', async () => {
  const env = pageFixture(snapshot => Promise.resolve({ path: `/tmp/${snapshot.themeId}-${snapshot.format}.jpg`, artFallback: false })); env.ready();
  for (let index = 0; index < 5; index++) {
    env.page.data.themeId = `theme-${index}`;
    env.page.refreshResultShareContext();
    await env.page.prepareResultShareCard(formatEvent(index % 2 ? 'portrait' : 'chat'));
    assert.ok(Object.keys(env.page._resultShareCache).length <= 4);
    if (index % 2) assert.notEqual(env.page.onShareAppMessage().imageUrl, `/tmp/theme-${index}-portrait.jpg`);
  }
  env.page.data.themeId = 'uncaptured-theme';
  env.page.refreshResultShareContext();
  assert.equal(env.page.data.resultShareImage, '');
  assert.equal(env.page.data.resultShareChatReady, false);
  assert.doesNotMatch(env.page.onShareAppMessage().imageUrl, /theme-\d/);
});
