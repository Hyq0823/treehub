const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const themePath = path.join(root, 'utils/themes.js');
const videoPath = path.join(root, 'utils/rewarded-video.js');
let memory, failKey, themes;
const completed = ids => ids.map((testId, index) => ({ testId, scoringVersion: '2', completedAt: `2026-10-${String(20 + index).padStart(2, '0')}T08:00:00.000Z` }));

beforeEach(() => {
  memory = new Map(); failKey = '';
  global.wx = {
    getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
    setStorageSync: (key, value) => { if (failKey === 'all' || failKey === key) throw new Error('storage full'); memory.set(key, structuredClone(value)); },
    removeStorageSync: key => memory.delete(key), showToast() {}, switchTab() {}, showModal() {}
  };
  delete require.cache[themePath];
  themes = require(themePath);
});

test('first completed test allows one free starter choice; theme grants never touch report rights', () => {
  assert.throws(() => themes.claimStarter('adventurer', []), /第一次测试/);
  const records = completed(['mbti']);
  const state = themes.claimStarter('romantic', records);
  assert.equal(state.selectedId, 'romantic');
  assert.equal(state.unlocked.length, 1);
  assert.equal(state.unlocked[0].source, 'starter');
  assert.throws(() => themes.claimStarter('adventurer', records), /已领取/);
  assert.equal(memory.has('personalityTreeArchive.v1'), false);
  assert.equal(memory.has('personalityTreePremiumPending.v1'), false);
});

test('a completed video is mandatory and scoped to the exact theme', () => {
  const records = completed(['ie']);
  assert.throws(() => themes.persistPendingGrant('moon', records), /完整观看/);
  themes.rememberCompletedGrant('moon', records);
  assert.throws(() => themes.persistPendingGrant('dreamer', records), /完整观看/);
  const state = themes.persistPendingGrant('moon', records);
  assert.equal(state.selectedId, 'moon');
  assert.deepEqual(state.unlocked.map(grant => grant.themeId), ['moon']);
  assert.equal(state.unlocked[0].source, 'rewarded-video');
  assert.equal(themes.getPendingGrant('moon'), null);
});

test('hidden theme requires five different current tests, not repeated or migrated records', () => {
  const repeated = completed(['mbti', 'mbti', 'mbti', 'mbti', 'mbti']);
  assert.equal(themes.getState(repeated).uniqueCount, 1);
  assert.throws(() => themes.rememberCompletedGrant('aurora', repeated), /5 类/);
  const four = completed(['mbti', 'ie', 'enneagram', 'bigfive']);
  const legacy = Object.assign({}, completed(['shadow'])[0], { migrated: true });
  assert.throws(() => themes.rememberCompletedGrant('aurora', four.concat(legacy)), /5 类/);
  const five = four.concat(completed(['shadow']));
  assert.equal(themes.getState(five).catalog.find(theme => theme.id === 'aurora').discovered, true);
  assert.equal(themes.getState(five).catalog.find(theme => theme.id === 'aurora').unlocked, false);
  themes.rememberCompletedGrant('aurora', five);
  assert.equal(themes.persistPendingGrant('aurora', five).selectedId, 'aurora');
});

test('a completed theme video survives failed state writes and helper reload without replay', () => {
  const records = completed(['ie']);
  themes.rememberCompletedGrant('listener', records);
  failKey = themes.STORAGE_KEY;
  assert.throws(() => themes.persistPendingGrant('listener', records), /无需重看/);
  assert.ok(memory.get(themes.PENDING_KEY).grants.some(grant => grant.themeId === 'listener'));
  delete require.cache[themePath];
  themes = require(themePath);
  assert.ok(themes.getPendingGrant('listener'));
  failKey = '';
  const state = themes.persistPendingGrant('listener', records);
  assert.equal(state.unlocked[0].themeId, 'listener');
  assert.equal(themes.getPendingGrant('listener'), null);
});

test('when all writes fail the current process retains completed-video receipt', () => {
  const records = completed(['ie']);
  failKey = 'all';
  themes.rememberCompletedGrant('collector', records);
  assert.throws(() => themes.persistPendingGrant('collector', records));
  assert.ok(themes.getPendingGrant('collector'));
  failKey = '';
  assert.equal(themes.persistPendingGrant('collector', records).selectedId, 'collector');
});

test('cloud theme merge is an idempotent union; sync payload contains no assessment data', () => {
  const records = completed(['ie']);
  themes.claimStarter('adventurer', records);
  const grant = { themeId: 'moon', unlockedAt: '2026-10-01T00:00:00.000Z', source: 'rewarded-video' };
  const cloud = { version: 1, selectedId: 'moon', starterClaimed: false, unlocked: [grant] };
  themes.mergeCloudState(cloud); themes.mergeCloudState(cloud);
  const payload = themes.getSyncPayload();
  assert.equal(payload.selectedId, 'adventurer', 'local owned choice remains stable');
  assert.equal(payload.unlocked.length, 2);
  assert.deepEqual(Object.keys(payload).sort(), ['selectedId', 'starterClaimed', 'unlocked', 'version']);
  assert.equal(JSON.stringify(payload).includes('answers'), false);
  assert.equal(JSON.stringify(payload).includes('scores'), false);
  assert.throws(() => themes.mergeCloudState({ version: 1, unlocked: [{ ...grant, themeId: 'unknown' }] }), /无效/);
  assert.throws(() => themes.mergeCloudState({ version: 1, unlocked: [{ ...grant, source: 'starter' }] }), /无效/);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { resolve, reject, promise };
}
function adMock({ show = [], load = [] } = {}) {
  const listeners = { load: new Set(), error: new Set(), close: new Set() };
  const stats = { show: 0, load: 0, destroy: 0 };
  const response = value => typeof value === 'function' ? value() : value || Promise.resolve();
  return {
    listeners, stats,
    show() { return response(show[stats.show++]); }, load() { return response(load[stats.load++]); },
    onLoad: fn => listeners.load.add(fn), onError: fn => listeners.error.add(fn), onClose: fn => listeners.close.add(fn),
    offLoad: fn => listeners.load.delete(fn), offError: fn => listeners.error.delete(fn), offClose: fn => listeners.close.delete(fn),
    destroy() { stats.destroy++; }, emit(event, value) { [...listeners[event]].forEach(fn => fn(value)); }
  };
}
function controller(ad = adMock()) {
  const completed = [], states = [], partial = [], errors = [];
  global.wx.createRewardedVideoAd = input => { assert.equal(input.adUnitId, 'adunit-c4b863e073c10066'); return ad; };
  const video = require(videoPath).createRewardedVideo({ onState: value => states.push(value), onComplete: id => completed.push(id), onPartial: id => partial.push(id), onError: value => errors.push(value) });
  return { video, ad, completed, states, partial, errors };
}

test('partial views, missing completion flags and unsolicited callbacks never unlock themes', async () => {
  const { video, ad, completed, partial } = controller();
  await video.play('moon'); ad.emit('close', { isEnded: false });
  await video.play('listener'); ad.emit('close', undefined);
  ad.emit('close', { isEnded: true });
  assert.deepEqual(completed, []);
  assert.deepEqual(partial, ['moon', 'listener']);
  await video.play('dreamer'); ad.emit('close', { isEnded: true });
  assert.deepEqual(completed, ['dreamer']);
});

test('repeated taps cannot replace a captured theme during display', async () => {
  const { video, ad, completed } = controller();
  await video.play('moon');
  assert.equal(await video.play('observer'), false);
  assert.equal(ad.stats.show, 1);
  ad.emit('close', { isEnded: true });
  assert.deepEqual(completed, ['moon']);
});

test('unload during show failure never retries or grants later callbacks', async () => {
  const opening = deferred();
  const { video, ad, completed, states } = controller(adMock({ show: [opening.promise] }));
  const pending = video.play('moon');
  const close = [...ad.listeners.close][0];
  video.dispose();
  const count = states.length;
  opening.reject(new Error('not ready after leaving'));
  await assert.doesNotReject(pending);
  close({ isEnded: true });
  assert.equal(ad.stats.load, 0);
  assert.equal(ad.stats.destroy, 1);
  assert.equal(states.length, count);
  assert.deepEqual(completed, []);
});

test('unload during retry load never displays another video', async () => {
  const loading = deferred();
  const { video, ad } = controller(adMock({ show: [() => Promise.reject(new Error('load first'))], load: [loading.promise] }));
  const pending = video.play('moon');
  await new Promise(done => setImmediate(done));
  assert.equal(ad.stats.load, 1);
  video.dispose(); loading.resolve();
  await pending;
  assert.equal(ad.stats.show, 1);
});

test('retry-load error retains the lock; display error restores ability to retry', async () => {
  const loading = deferred();
  const { video, ad, errors } = controller(adMock({ show: [() => Promise.reject(new Error('load first'))], load: [loading.promise] }));
  const pending = video.play('moon');
  await new Promise(done => setImmediate(done));
  ad.emit('error', new Error('loading'));
  assert.equal(video.isBusy(), true);
  assert.equal(await video.play('observer'), false);
  loading.resolve(); await pending;
  ad.emit('error', new Error('display failed'));
  assert.equal(video.isBusy(), false);
  assert.equal(errors.length, 1);
  assert.equal(await video.play('observer'), true);
});

test('late close from failed display A cannot unlock a later display B', async () => {
  const first = adMock(), second = adMock();
  const instances = [first, second];
  const completed = [];
  global.wx.createRewardedVideoAd = () => instances.shift();
  const video = require(videoPath).createRewardedVideo({ onComplete: id => completed.push(id) });
  await video.play('moon');
  const lateCloseA = [...first.listeners.close][0];
  first.emit('error', new Error('display A failed'));
  assert.equal(first.stats.destroy, 1);
  assert.equal(video.isBusy(), false);
  await video.play('observer');
  lateCloseA({ isEnded: true });
  assert.deepEqual(completed, []);
  assert.equal(video.isBusy(), true);
  second.emit('close', { isEnded: true });
  assert.deepEqual(completed, ['observer']);
});

test('switching away from my-tree while retry loading cancels replay and late grants', async () => {
  let page;
  const file = path.join(root, 'pages/my-tree/index.js');
  const nativeRequire = createRequire(file);
  const records = completed(['ie']);
  const loading = deferred();
  const first = adMock({ show: [() => Promise.reject(new Error('load first'))], load: [loading.promise] });
  const second = adMock();
  const instances = [first, second];
  global.wx.createRewardedVideoAd = () => instances.shift();
  global.wx.showModal = value => value.success({ confirm: true });
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { page = value; }, wx: global.wx, console,
    require: name => name.endsWith('/archive.js') ? { getRecords: () => records } : name.endsWith('/theme-assets.js') ? { resolveThemeAsset: async () => '' } : nativeRequire(name)
  }, { filename: file });
  page.data = structuredClone(page.data);
  let updates = 0;
  page.setData = value => { updates++; Object.assign(page.data, value); };
  page.onLoad({}); page.onShow();
  page.inspectTheme({ currentTarget: { dataset: { id: 'moon' } } });
  await page.useOrUnlockTheme();
  await new Promise(done => setImmediate(done));
  const lateClose = [...first.listeners.close][0];
  assert.equal(first.stats.load, 1);
  page.onHide();
  const count = updates;
  loading.resolve();
  await new Promise(done => setImmediate(done));
  lateClose({ isEnded: true });
  assert.equal(first.stats.show, 1);
  assert.equal(updates, count);
  assert.equal(themes.getPendingGrant('moon'), null);
  assert.equal(first.stats.destroy, 1);
  page.onShow();
  page.inspectTheme({ currentTarget: { dataset: { id: 'moon' } } });
  await page.useOrUnlockTheme();
  assert.equal(second.stats.show, 1, 'returning creates a fresh usable controller');
  page.onUnload();
});

test('my-tree sharing includes only a public theme id and no private record or identity', () => {
  let page;
  const file = path.join(root, 'pages/my-tree/index.js');
  const nativeRequire = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { page = value; }, wx: global.wx, console,
    require: name => name.endsWith('/theme-assets.js') ? { resolveThemeAsset: async () => '' } : nativeRequire(name)
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = value => Object.assign(page.data, value);
  page.onLoad({ theme: 'moon', recordId: 'private-record', scores: 'private-score', openid: 'private-owner' });
  page.data.current = require('../data/themes.js').getTheme('moon');
  const direct = page.onShareAppMessage();
  const timeline = page.onShareTimeline();
  assert.equal(direct.path, '/pages/my-tree/index?theme=moon');
  assert.equal(timeline.query, 'theme=moon');
  assert.equal(JSON.stringify([direct, timeline]).includes('private'), false);
  page.onUnload();
});

function myTreePage(records = [], assetResolver = async () => '') {
  let page;
  const file = path.join(root, 'pages/my-tree/index.js');
  const nativeRequire = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { page = value; }, wx: global.wx, console,
    require: name => name.endsWith('/archive.js') ? { getRecords: () => records } : name.endsWith('/theme-assets.js') ? { resolveThemeAsset: assetResolver } : nativeRequire(name)
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = value => Object.assign(page.data, value);
  return page;
}

test('unknown visitor aurora link cannot request hidden art or export an owned poster', async () => {
  const requested = [], dialogs = [];
  global.wx.showModal = value => dialogs.push(value);
  global.wx.createSelectorQuery = () => { throw new Error('locked poster must not allocate a canvas'); };
  const page = myTreePage([], async id => { requested.push(id); return ''; });
  page.onLoad({ theme: 'aurora' }); page.onShow();
  await new Promise(done => setImmediate(done));
  assert.equal(page.data.current.id, 'aurora');
  assert.equal(page.data.current.discovered, false);
  assert.equal(page.data.current.unlocked, false);
  assert.equal(requested.includes('aurora'), false);
  assert.equal(page.data.heroUrl, '');
  await page.createPoster();
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0].content, /5 类/);
  assert.equal(page.data.posterBusy, false);
  page.onUnload();
});

test('previously owned hidden theme remains discovered when result history is unavailable', () => {
  const five = completed(['mbti', 'ie', 'enneagram', 'bigfive', 'shadow']);
  themes.rememberCompletedGrant('aurora', five);
  themes.persistPendingGrant('aurora', five);
  assert.equal(themes.getState([]).catalog.find(theme => theme.id === 'aurora').discovered, true);
});

function posterEnvironment() {
  let selectorCallback;
  const drawn = [], words = [], previews = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: text => ({ width: text.length * 12 }),
    drawImage: image => drawn.push(image.src), fillText: text => words.push(text)
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = {
    getContext: () => ctx,
    createImage: () => {
      const image = { width: 500, height: 500 };
      Object.defineProperty(image, 'src', { get: () => image._src, set(value) { image._src = value; queueMicrotask(() => image.onload()); } });
      return image;
    }
  };
  global.wx.createSelectorQuery = () => {
    const query = { select: () => query, fields: () => query, exec: callback => { selectorCallback = callback; } };
    return query;
  };
  global.wx.canvasToTempFilePath = value => value.success({ tempFilePath: '/tmp/theme-poster.png' });
  global.wx.previewImage = value => previews.push(value);
  return { drawn, words, previews, resolveCanvas: () => selectorCallback([{ node: canvas }]) };
}

test('poster captures one owned theme and asset even if the user previews another while rendering', async () => {
  const page = myTreePage();
  page.onLoad({});
  const env = posterEnvironment();
  page.data.current = { ...require('../data/themes.js').getTheme('moon'), unlocked: true, discovered: true };
  page.data.heroUrl = 'https://example.com/moon.png';
  const creating = page.createPoster();
  page.data.current = { ...require('../data/themes.js').getTheme('listener'), unlocked: false, discovered: true };
  page.data.heroUrl = 'https://example.com/listener.png';
  env.resolveCanvas(); await creating;
  assert.deepEqual(env.drawn, ['https://example.com/moon.png']);
  assert.ok(env.words.includes('月光守护者'));
  assert.equal(env.words.includes('温柔的倾听者'), false);
  assert.equal(env.previews.length, 1);
  page.onUnload();
});

test('leaving the tree tab during poster creation never opens a late image preview', async () => {
  const page = myTreePage();
  page.onLoad({});
  const env = posterEnvironment();
  page.data.current = { ...require('../data/themes.js').getTheme('moon'), unlocked: true, discovered: true };
  page.data.heroUrl = 'https://example.com/moon.png';
  const creating = page.createPoster();
  page.onHide();
  env.resolveCanvas(); await creating;
  assert.deepEqual(env.drawn, []);
  assert.equal(env.previews.length, 0);
  page.onUnload();
});
