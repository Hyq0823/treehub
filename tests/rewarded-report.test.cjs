const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const archive = require('../utils/archive.js');
const { scoreTest } = require('../utils/scoring.js');
const catalog = require('../data/tests/index.js').default;

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'packages/reports/premium-access.js');
const pagePath = path.join(root, 'packages/reports/index.js');
let memory, writeFailure, calls;

beforeEach(() => {
  memory = new Map();
  writeFailure = '';
  calls = { createAd: 0, data: [], toast: [], modal: [], errors: [] };
  delete require.cache[helperPath];
  global.wx = {
    getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
    setStorageSync: (key, value) => {
      if (writeFailure === 'all' || writeFailure === 'archive' && key === archive.STORAGE_KEY) {
        throw new Error('device storage is full');
      }
      memory.set(key, structuredClone(value));
    },
    removeStorageSync: key => {
      if (writeFailure === 'all') throw new Error('device storage is full');
      memory.delete(key);
    },
    showToast: value => calls.toast.push(value),
    showModal: value => calls.modal.push(value),
    switchTab() {}, redirectTo() {}
  };
});

function record(choice = 0) {
  const selected = catalog.find(item => item.id === 'ie');
  return archive.saveResult({
    testId: selected.id,
    ...scoreTest(selected, selected.questions, selected.questions.map(() => choice))
  });
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function makeAd({ show = [], load = [] } = {}) {
  const handlers = { load: new Set(), error: new Set(), close: new Set() };
  const stats = { show: 0, load: 0, destroy: 0 };
  const respond = response => typeof response === 'function' ? response() : response || Promise.resolve();
  return {
    stats, handlers,
    show() { return respond(show[stats.show++]); },
    load() { return respond(load[stats.load++]); },
    onLoad: callback => handlers.load.add(callback),
    onError: callback => handlers.error.add(callback),
    onClose: callback => handlers.close.add(callback),
    offLoad: callback => handlers.load.delete(callback),
    offError: callback => handlers.error.delete(callback),
    offClose: callback => handlers.close.delete(callback),
    destroy() { stats.destroy++; },
    emit(event, value) { for (const callback of [...handlers[event]]) callback(value); }
  };
}

function openPage(saved, ad = makeAd()) {
  let page;
  const nativeRequire = createRequire(pagePath);
  global.wx.createRewardedVideoAd = ({ adUnitId }) => {
    assert.equal(adUnitId, 'adunit-c4b863e073c10066');
    calls.createAd++;
    return ad;
  };
  vm.runInNewContext(fs.readFileSync(pagePath, 'utf8'), {
    Page: value => { page = value; }, wx: global.wx,
    console: { log() {}, error: (...args) => calls.errors.push(args) },
    require: id => id.endsWith('/track.js') ? { report() {}, EVENTS: {} } : nativeRequire(id)
  }, { filename: pagePath });
  page.data = structuredClone(page.data);
  page.setData = value => {
    calls.data.push(structuredClone(value));
    Object.assign(page.data, value);
  };
  page.onLoad({ id: saved.testId, recordId: saved.id });
  assert.equal(page.data.state, 'ready');
  return { page, ad };
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

async function finishVideo(page, ad) {
  await page.showPremiumAd();
  ad.emit('close', { isEnded: true });
  await flush();
}

test('completed video can retry a failed archive write without replaying or unlocking a different report', async () => {
  const first = record();
  const second = record(1);
  const { page, ad } = openPage(first);
  writeFailure = 'archive';
  await finishVideo(page, ad);
  assert.equal(page.data.premiumUnlocked, true);
  assert.equal(page.data.premiumSavePending, true);
  assert.ok(page.data.premiumSaveError);
  assert.equal(archive.getRecord(first.id).premiumUnlockedAt, undefined);
  assert.ok(require(helperPath).getPendingGrant(first.id));
  writeFailure = '';
  await page.retryPremiumSave();
  assert.ok(archive.getRecord(first.id).premiumUnlockedAt);
  assert.equal(archive.getRecord(second.id).premiumUnlockedAt, undefined);
  assert.equal(page.data.premiumSavePending, false);
  assert.equal(page.data.premiumSaveError, '');
  assert.equal(ad.stats.show, 1);
});

test('a small completed-view receipt survives a helper reload and restores the exact report without another video', async () => {
  const saved = record();
  const { page, ad } = openPage(saved);
  writeFailure = 'archive';
  await finishVideo(page, ad);
  page.onUnload();
  delete require.cache[helperPath];
  assert.ok(require(helperPath).getPendingGrant(saved.id), 'receipt must survive module-memory loss');
  writeFailure = '';
  const reopened = openPage(saved);
  await reopened.page.onShow();
  assert.equal(reopened.page.data.premiumUnlocked, true);
  assert.equal(reopened.page.data.premiumSavePending, false);
  assert.ok(archive.getRecord(saved.id).premiumUnlockedAt);
  assert.equal(reopened.ad.stats.show, 0);
});

test('when every write fails, a completed view remains recoverable across page instances in the same process', async () => {
  const saved = record();
  const { page, ad } = openPage(saved);
  writeFailure = 'all';
  await finishVideo(page, ad);
  assert.equal(page.data.premiumSavePending, true);
  assert.equal(archive.getRecord(saved.id).premiumUnlockedAt, undefined);
  page.onUnload();
  const reopened = openPage(saved);
  assert.equal(reopened.page.data.premiumUnlocked, true);
  assert.equal(reopened.page.data.premiumSavePending, true);
  writeFailure = '';
  await reopened.page.retryPremiumSave();
  assert.ok(archive.getRecord(saved.id).premiumUnlockedAt);
  assert.equal(reopened.ad.stats.show, 0);
});

test('explicit local-data deletion invalidates the in-memory completed-report receipt', async () => {
  const saved = record();
  const { page, ad } = openPage(saved);
  writeFailure = 'archive';
  await finishVideo(page, ad);
  const helper = require(helperPath);
  assert.ok(helper.getPendingGrant(saved.id));
  writeFailure = '';
  memory.delete(helper.PENDING_KEY);
  global.getApp = () => ({ globalData: { privacyResetRevision: 1 } });
  try { assert.equal(helper.getPendingGrant(saved.id), null); }
  finally { delete global.getApp; }
});

test('returning to a pending report retries persistence after storage recovers', async () => {
  const saved = record();
  const { page, ad } = openPage(saved);
  writeFailure = 'archive';
  await finishVideo(page, ad);
  writeFailure = '';
  await page.onShow();
  assert.equal(page.data.premiumSavePending, false);
  assert.ok(archive.getRecord(saved.id).premiumUnlockedAt);
  assert.equal(ad.stats.show, 1);
});

test('leaving before the first show rejects causes no retry, page update or unhandled rejection', async () => {
  const saved = record();
  const opening = deferred();
  const { page, ad } = openPage(saved, makeAd({ show: [opening.promise] }));
  const lateClose = [...ad.handlers.close][0];
  const lateLoad = [...ad.handlers.load][0];
  const pending = page.showPremiumAd();
  page.onUnload();
  const dataCount = calls.data.length;
  const toastCount = calls.toast.length;
  opening.reject(new Error('show failed after leaving'));
  await assert.doesNotReject(pending);
  lateClose({ isEnded: true });
  lateLoad();
  await flush();
  assert.equal(ad.stats.show, 1);
  assert.equal(ad.stats.load, 0);
  assert.equal(ad.stats.destroy, 1);
  assert.equal(calls.data.length, dataCount);
  assert.equal(calls.toast.length, toastCount);
  assert.equal(archive.getRecord(saved.id).premiumUnlockedAt, undefined);
});

test('leaving during a retry load never opens another video after that load resolves', async () => {
  const saved = record();
  const loading = deferred();
  const { page, ad } = openPage(saved, makeAd({
    show: [() => Promise.reject(new Error('not ready'))], load: [loading.promise]
  }));
  const pending = page.showPremiumAd();
  await flush();
  assert.equal(ad.stats.load, 1);
  page.onUnload();
  const dataCount = calls.data.length;
  loading.resolve();
  await assert.doesNotReject(pending);
  assert.equal(ad.stats.show, 1);
  assert.equal(calls.data.length, dataCount);
});

test('retry display failure is caught, restores the button and permits a subsequent valid attempt', async () => {
  const saved = record();
  const { page, ad } = openPage(saved, makeAd({ show: [
    () => Promise.reject(new Error('initial show failed')),
    () => Promise.reject(new Error('retry show failed')),
    () => Promise.resolve()
  ] }));
  await assert.doesNotReject(page.showPremiumAd());
  assert.equal(page.data.adWatching, false);
  assert.ok(page.data.adError);
  assert.equal(ad.stats.show, 2);
  assert.equal(ad.stats.load, 1);
  assert.equal(archive.getRecord(saved.id).premiumUnlockedAt, undefined);
  await finishVideo(page, ad);
  assert.equal(ad.stats.show, 3);
  assert.ok(archive.getRecord(saved.id).premiumUnlockedAt);
});

test('an error after video display releases the button and old callbacks cannot unlock a new attempt', async () => {
  const saved = record();
  const { page, ad } = openPage(saved);
  const staleClose = [...ad.handlers.close][0];
  await page.showPremiumAd();
  ad.emit('error', { errMsg: 'display interrupted' });
  assert.equal(page.data.adWatching, false);
  assert.equal(ad.stats.destroy, 1);
  const nextAd = makeAd();
  wx.createRewardedVideoAd = () => nextAd;
  await page.showPremiumAd();
  staleClose({ isEnded: true });
  assert.equal(archive.getRecord(saved.id).premiumUnlockedAt, undefined);
  nextAd.emit('close', { isEnded: true });
  assert.ok(archive.getRecord(saved.id).premiumUnlockedAt);
});

test('partial views and close callbacks without an active request cannot grant access', async () => {
  const saved = record();
  const { page, ad } = openPage(saved);
  ad.emit('close', { isEnded: true });
  assert.equal(page.data.premiumUnlocked, false);
  await page.showPremiumAd();
  ad.emit('close', { isEnded: false });
  ad.emit('close', { isEnded: true });
  assert.equal(page.data.premiumUnlocked, false);
  assert.equal(archive.getRecord(saved.id).premiumUnlockedAt, undefined);
  assert.equal(require(helperPath).getPendingGrant(saved.id), null);
});

test('an ad error during retry loading does not allow duplicate requests to start', async () => {
  const saved = record();
  const loading = deferred();
  const { page, ad } = openPage(saved, makeAd({
    show: [() => Promise.reject(new Error('needs loading'))], load: [loading.promise]
  }));
  const first = page.showPremiumAd();
  await flush();
  ad.emit('error', { errCode: 1004, errMsg: 'not ready yet' });
  await page.showPremiumAd();
  await page.showPremiumAd();
  assert.equal(ad.stats.show, 1);
  assert.equal(ad.stats.load, 1);
  loading.resolve();
  await first;
  assert.equal(ad.stats.show, 2);
  ad.emit('close', { isEnded: true });
  assert.ok(archive.getRecord(saved.id).premiumUnlockedAt);
});

test('a permanently unlocked historical report never creates an ad instance', async () => {
  const saved = record();
  archive.unlockPremium(saved.id);
  const { page, ad } = openPage(saved);
  await page.onShow();
  assert.equal(page.data.premiumUnlocked, true);
  assert.equal(page.data.premiumSavePending, false);
  assert.equal(calls.createAd, 0);
  await page.showPremiumAd();
  assert.equal(ad.stats.show, 0);
});

test('VIP report prepares screenshot chart data and switches between three compact pages', () => {
  const saved = record();
  const { page } = openPage(saved);
  assert.ok(page.data.deepReport.dimensions.every(item => Number.isFinite(item.clarity) && item.preference));
  assert.equal(page.data.deepReport.actionPlan.length, 3);
  page.selectPremiumPage({ currentTarget: { dataset: { page: 'insights' } } });
  assert.equal(page.data.premiumPage, 'insights');
  page.selectPremiumPage({ currentTarget: { dataset: { page: 'actions' } } });
  assert.equal(page.data.premiumPage, 'actions');
  page.selectPremiumPage({ currentTarget: { dataset: { page: 'invalid' } } });
  assert.equal(page.data.premiumPage, 'actions');
});
