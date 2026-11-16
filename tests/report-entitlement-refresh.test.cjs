const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const archive = require('../utils/archive.js');
const { getTest } = require('../data/test-loader.js');
const { scoreTest } = require('../utils/scoring.js');
const root = path.resolve(__dirname, '..');
const pendingPath = path.join(root, 'packages/reports/premium-access.js');
const videoPath = path.join(root, 'packages/reports/rewarded-video.js');
let memory, faults, reads, navigation, toasts, nativeAds;

beforeEach(() => {
  memory = new Map(); faults = { archiveRead: false, pendingRead: false, writes: false };
  reads = new Map(); navigation = []; toasts = []; nativeAds = [];
  delete require.cache[pendingPath]; delete require.cache[videoPath];
  const app = { globalData: {} };
  global.getApp = () => app;
  global.wx = {
    getStorageSync(key) {
      reads.set(key, (reads.get(key) || 0) + 1);
      if (faults.archiveRead && key === archive.STORAGE_KEY || faults.pendingRead && key === 'personalityTreePremiumPending.v1') throw new Error('read unavailable');
      return memory.has(key) ? structuredClone(memory.get(key)) : '';
    },
    setStorageSync(key, value) { if (faults.writes) throw new Error('storage full'); memory.set(key, structuredClone(value)); },
    removeStorageSync(key) { memory.delete(key); },
    navigateTo(value) { navigation.push(value); }, redirectTo(value) { navigation.push(value); },
    switchTab(value) { navigation.push(value); }, setNavigationBarTitle() {},
    showToast(value) { toasts.push(value); }, showModal() {},
    createRewardedVideoAd() {
      const listeners = { load: new Set(), error: new Set(), close: new Set() };
      const ad = {
        shows: 0,
        async show() { ad.shows++; }, async load() {},
        onLoad(fn) { listeners.load.add(fn); }, offLoad(fn) { listeners.load.delete(fn); },
        onError(fn) { listeners.error.add(fn); }, offError(fn) { listeners.error.delete(fn); },
        onClose(fn) { listeners.close.add(fn); }, offClose(fn) { listeners.close.delete(fn); },
        close(ended) { for (const listener of [...listeners.close]) listener({ isEnded: ended }); },
        destroy() { throw new Error('page disposal must not destroy a native ad'); }
      };
      nativeAds.push(ad); return ad;
    }
  };
});

function records() {
  const quiz = getTest('mbti');
  return [0, 1].map(choice => archive.saveResult({ testId: quiz.id, testVersion: '1', scoringVersion: '2',
    ...scoreTest(quiz, quiz.questions, quiz.questions.map(() => choice)) }));
}

function page(route, options) {
  const file = path.join(root, route + '.js'), nativeRequire = createRequire(file);
  let value;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(definition) { value = definition; }, wx: global.wx, getApp: global.getApp, console, setTimeout, clearTimeout,
    require(id) {
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id === '../../utils/themes.js') return { getState: () => ({ starterClaimed: true, selectedId: '', catalog: [] }) };
      return nativeRequire(id);
    }
  }, { filename: file });
  value.data = structuredClone(value.data);
  value.setData = changes => Object.assign(value.data, changes);
  value.onLoad(options); value.onShow();
  assert.equal(value.data.state, 'ready');
  return value;
}
const report = record => page('packages/reports/index', { id: record.testId, recordId: record.id });
const shows = () => nativeAds.reduce((sum, ad) => sum + ad.shows, 0);

test('report → comparison → another instance unlocks the same record once, and returning never asks for another video', async () => {
  const [older, current] = records();
  const original = report(current);
  original.openComparison(); original.onHide();
  const comparison = page('packages/reports/compare/index', { id: current.testId, recordId: current.id, previousRecordId: older.id });
  assert.equal(comparison.data.dimensions.length, 2);
  comparison.openReport({ currentTarget: { dataset: { side: 'after' } } }); comparison.onHide();
  const second = report(current);
  await second.showPremiumAd();
  assert.equal(shows(), 1);
  nativeAds[0].close(true);
  assert.ok(archive.getRecord(current.id).premiumUnlockedAt);
  second.onUnload(); comparison.onShow();
  assert.equal(comparison.data.dimensions.length, 4);
  comparison.onUnload(); original.onShow();
  assert.equal(original.data.premiumUnlocked, true);
  assert.equal(original.data.premiumSavePending, false);
  await original.showPremiumAd();
  assert.equal(shows(), 1);
  original.onUnload();
});

test('the initial report reuses its loaded rights, while a grant saved immediately before tapping is rechecked without reading pending storage', async () => {
  const [, current] = records(); reads.clear();
  const view = report(current);
  assert.equal(reads.get(archive.STORAGE_KEY), 2, 'cold load reads the selected record and one shared history only');
  const helper = require(pendingPath), pendingReads = reads.get(helper.PENDING_KEY);
  archive.unlockPremium(current.id);
  await view.showPremiumAd();
  assert.equal(view.data.premiumUnlocked, true);
  assert.equal(reads.get(helper.PENDING_KEY), pendingReads, 'a persisted grant needs no pending-key read');
  assert.equal(shows(), 0);
  view.onUnload();
});

test('an unlocked other report and another record receipt never unlock this report', async () => {
  const [other, current] = records();
  archive.unlockPremium(other.id);
  require(pendingPath).rememberCompletedGrant(other.id);
  const view = report(current);
  await view.showPremiumAd();
  assert.equal(view.data.premiumUnlocked, false);
  assert.equal(shows(), 1);
  nativeAds[0].close(false);
  assert.equal(archive.getRecord(current.id).premiumUnlockedAt, undefined);
  view.onUnload();
});

test('an explicitly missing current record cannot be replaced by another record or a detached receipt', async () => {
  const [other, current] = records();
  archive.unlockPremium(other.id);
  const view = report(current);
  require(pendingPath).rememberCompletedGrant(current.id);
  const stored = memory.get(archive.STORAGE_KEY);
  stored.records = stored.records.filter(item => item.id !== current.id);
  await view.showPremiumAd();
  assert.equal(view.data.premiumUnlocked, false);
  assert.match(view.data.adError, /不在当前设备/);
  assert.equal(shows(), 0);
  view.onUnload();
});

test('unknown archive or receipt state blocks a new video and remains retryable after reads recover', async () => {
  for (const failure of ['archiveRead', 'pendingRead']) {
    const [, current] = records();
    const view = report(current);
    faults[failure] = true;
    await view.showPremiumAd();
    assert.equal(shows(), 0);
    assert.match(view.data.adError, /稍后重试/);
    faults[failure] = false;
    await view.showPremiumAd();
    assert.equal(shows(), 1);
    assert.equal(view.data.adError, '');
    nativeAds.at(-1).close(false);
    view.onUnload();
    // Use a fresh native manager/Map for the second independent read failure.
    delete require.cache[videoPath]; nativeAds = [];
  }
});

test('a failed refresh preserves already available rights instead of revoking them or replaying a video', async () => {
  const [, current] = records();
  archive.unlockPremium(current.id);
  const view = report(current);
  assert.equal(view.data.premiumUnlocked, true);
  view.onHide(); faults.archiveRead = true; faults.pendingRead = true; view.onShow();
  assert.equal(view.data.premiumUnlocked, true);
  await view.showPremiumAd();
  assert.equal(shows(), 0);
  view.onUnload();
});

test('a completed receipt in memory remains usable during storage failures and saves later without replay', async () => {
  const [, current] = records();
  const view = report(current), helper = require(pendingPath);
  faults.writes = true;
  helper.rememberCompletedGrant(current.id);
  view.onHide(); faults.archiveRead = true; faults.pendingRead = true; view.onShow();
  assert.equal(view.data.premiumUnlocked, true);
  assert.equal(view.data.premiumSavePending, true);
  assert.ok(view.data.premiumSaveError);
  await view.showPremiumAd();
  assert.equal(shows(), 0);
  assert.equal(helper.getPendingGrantState(current.id).readable, false);
  view.onHide(); faults.archiveRead = false; faults.pendingRead = false; faults.writes = false; view.onShow();
  assert.equal(view.data.premiumSavePending, false);
  assert.ok(archive.getRecord(current.id).premiumUnlockedAt);
  assert.equal(shows(), 0);
  view.onUnload();
});

test('receipt status exposes read uncertainty without discarding completed memory receipts or changing the old getter', () => {
  const helper = require(pendingPath);
  assert.deepEqual(helper.getPendingGrantState('current'), { receipt: null, readable: true });
  const receipt = helper.rememberCompletedGrant('current');
  faults.pendingRead = true;
  const state = helper.getPendingGrantState('current');
  assert.equal(state.readable, false);
  assert.deepEqual(state.receipt, receipt);
  state.receipt.recordId = 'changed-copy';
  assert.deepEqual(helper.getPendingGrant('current'), receipt);
  assert.deepEqual(helper.getPendingGrantState('other'), { receipt: null, readable: false });
});

test('a stale comparison-navigation failure cannot release a newer navigation lock', () => {
  const [, current] = records();
  const view = report(current);
  view.openComparison();
  const lateFailure = navigation[0].fail;
  view.onHide(); view.onShow(); view.openComparison();
  lateFailure(); view.openComparison();
  assert.equal(navigation.length, 2);
  assert.equal(toasts.length, 0);
  navigation[1].fail(); view.openComparison();
  assert.equal(navigation.length, 3);
  assert.equal(toasts.length, 1);
  view.onUnload(); navigation[2].fail();
  assert.equal(toasts.length, 1);
});
