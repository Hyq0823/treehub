const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { buildArchiveView, HISTORY_PAGE_SIZE } = require('../utils/archive-view.js');
const { catalog } = require('../data/test-catalog.js');
const root = path.resolve(__dirname, '..');

function record(index, changes = {}) {
  return Object.assign({
    id: `private-${index}`, testId: 'mbti', testVersion: '1', scoringVersion: '2', resultType: 'INTJ',
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), lifeContext: 'ordinary',
    scores: { EI: -5, SN: 5, TF: -5, JP: 5 }, answers: Array(40).fill(2),
    treeSnapshot: { privateDetail: 'do not serialize', restoredFromSummary: false }
  }, changes);
}

function pageFixture(initialRecords, options = {}) {
  const file = path.join(root, 'pages/user-center/index.js');
  const nativeRequire = createRequire(file);
  const payloads = [], navigation = [], toasts = [];
  let saved = { schemaVersion: 1, seed: 'test', records: initialRecords }, page;
  let error = null, syncs = 0;
  const status = { state: 'pending', message: '等待云同步' };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, console, Promise,
    getApp: () => ({ globalData: {} }),
    wx: {
      navigateTo(value) { navigation.push(value); },
      showToast(value) { toasts.push(value); }
    },
    require(id) {
      if (id === '../../utils/archive.js') return { getArchive() { if (error) throw error; return saved; } };
      if (id === '../../utils/cloud-sync.js') return {
        getStatus: () => status, isAutoSyncFresh: () => true,
        syncArchive: () => { syncs++; return options.sync ? options.sync() : Promise.resolve(status); }
      };
      if (id === '../../utils/privacy.js') return { isCloudBackupEnabled: () => true };
      if (id === '../../utils/tab-bar.js') return { syncTabBar() {} };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = changes => { payloads.push(changes); Object.assign(page.data, changes); };
  page._hidden = false;
  return {
    page, payloads, navigation, toasts, syncs: () => syncs,
    records(records) { saved = Object.assign({}, saved, { records }); },
    error(value) { error = value; }
  };
}

const tap = id => ({ currentTarget: { dataset: { id } } });

test('thousands of records initially send one lightweight latest summary per known test and no hidden history', () => {
  const rows = Array.from({ length: 4000 }, (_, index) => record(index, {
    testId: catalog[index % catalog.length].id,
    resultType: index % catalog.length ? 'unknown' : 'INTJ'
  }));
  const env = pageFixture(rows);
  env.page.loadArchive();
  assert.equal(env.page.data.totalCount, 4000);
  assert.equal(env.page.data.groups.length, catalog.length);
  assert.ok(env.page.data.groups.every(group => group.history.length === 0 && group.visibleCount === 0));
  assert.ok(env.page.data.groups.every(group => group.count >= Math.floor(rows.length / catalog.length)));
  const payload = JSON.stringify(env.payloads[0]);
  assert.ok(Buffer.byteLength(payload) < 18000, `initial payload was ${Buffer.byteLength(payload)} bytes`);
  for (const secret of ['"answers"', '"scores"', '"treeSnapshot"', 'privateDetail']) assert.equal(payload.includes(secret), false);
  assert.equal(env.page.data.groups[0].latest.id, `private-${Math.floor(3999 / catalog.length) * catalog.length}`);
});

test('history sorts lazily by completion time with stable ties without mutating original records', () => {
  const first = Object.freeze(record(1));
  const second = Object.freeze(record(9, { testVersion: '2', lifeContext: 'work' }));
  const tied = Object.freeze(record(10, { completedAt: second.completedAt, testVersion: '1' }));
  const legacy = Object.freeze(record(0, { migrated: true, scoringVersion: 'legacy', testVersion: 'legacy' }));
  const rows = Object.freeze([first, second, tied, legacy]);
  const view = buildArchiveView(rows);
  assert.equal(view.groups[0].latest.id, second.id);
  const visible = view.history('mbti', 20);
  assert.deepEqual(visible.map(item => item.id), [second.id, tied.id, first.id, legacy.id]);
  assert.equal(visible[0].contextLabel, '工作变化');
  assert.equal(visible[0].versionLabel, 'V2');
  assert.equal(visible[1].versionLabel, 'V1');
  assert.equal(visible[3].date, '旧版导入 · 原测评时间未知');
  assert.equal(visible[3].versionLabel, '');
  assert.equal(visible[3].contextLabel, '');
  assert.deepEqual(rows.map(item => item.id), [first.id, second.id, tied.id, legacy.id]);
});

test('expansion pages five records at a time and collapse frees view payload while retaining the chosen window', () => {
  const env = pageFixture(Array.from({ length: 13 }, (_, index) => record(index)));
  const page = env.page;
  page.loadArchive();
  page.loadMoreHistory(tap('mbti'));
  assert.equal(page.data.groups[0].history.length, 0, 'closed groups cannot load invisibly');
  page.toggleHistory(tap('mbti'));
  assert.equal(page.data.groups[0].history.length, HISTORY_PAGE_SIZE);
  assert.equal(page.data.groups[0].hasMore, true);
  page.loadMoreHistory(tap('mbti'));
  assert.equal(page.data.groups[0].history.length, 10);
  page.toggleHistory(tap('mbti'));
  assert.equal(page.data.groups[0].history.length, 0);
  page.toggleHistory(tap('mbti'));
  assert.equal(page.data.groups[0].history.length, 10);
  page.loadMoreHistory(tap('mbti'));
  assert.equal(page.data.groups[0].history.length, 13);
  assert.equal(page.data.groups[0].hasMore, false);
  page.loadMoreHistory(tap('mbti'));
  assert.equal(page.data.groups[0].history.length, 13);
  assert.equal(new Set(page.data.groups[0].history.map(item => item.id)).size, 13);
});

test('cloud refresh retains expanded windows, updates newest record, and labels restored summaries', () => {
  const rows = Array.from({ length: 12 }, (_, index) => record(index));
  const env = pageFixture(rows);
  env.page.onShow();
  env.page.toggleHistory(tap('mbti'));
  env.page.loadMoreHistory(tap('mbti'));
  const restored = record(90, { treeSnapshot: { restoredFromSummary: true }, answers: undefined, lifeContext: 'breakup' });
  env.records([restored, ...rows]);
  env.page.onHide();
  env.page.onShow();
  const group = env.page.data.groups[0];
  assert.equal(group.history.length, 10);
  assert.equal(group.count, 13);
  assert.equal(group.latest.id, restored.id);
  assert.equal(group.latest.restoredFromSummary, true);
  assert.equal(group.history[0].contextLabel, '分手后');
  assert.equal(group.hasMore, true);
});

test('unknown tests and malformed inputs cannot inject a group; failed reads do not modify or expose saved records', () => {
  assert.equal(buildArchiveView([null, record(2, { testId: '__proto__' }), {}]).groups.length, 0);
  const env = pageFixture([record(2)]);
  env.page.loadArchive();
  env.page.toggleHistory(tap('__proto__'));
  env.page.loadMoreHistory(tap('constructor'));
  assert.equal(env.page.data.groups[0].history.length, 0);
  env.error(new Error('本地存储读取失败'));
  env.page.loadArchive();
  assert.match(env.page.data.error, /读取失败/);
  assert.equal(env.page.data.groups.length, 0);
  assert.equal(env.page._archiveView, null);
  env.page.openRecord({ currentTarget: { dataset: { id: 'mbti', recordId: 'private-2' } } });
  assert.equal(env.navigation.length, 0);
  env.error(null); env.page.loadArchive();
  assert.equal(env.page.data.groups[0].count, 1);
});

test('exact historical links are encoded, mismatched records ignored, rapid taps coalesced and navigation failures retryable', () => {
  const env = pageFixture([record(2, { id: 'private a&b' }), record(4)]);
  env.page.loadArchive();
  env.page.openRecord({ currentTarget: { dataset: { id: 'mbti', recordId: 'not-here' } } });
  env.page.openRecord({ currentTarget: { dataset: { id: 'ie', recordId: 'private a&b' } } });
  assert.equal(env.navigation.length, 0);
  const event = { currentTarget: { dataset: { id: 'mbti', recordId: 'private a&b' } } };
  env.page.openRecord(event); env.page.openRecord(event);
  assert.equal(env.navigation.length, 1);
  assert.equal(env.navigation[0].url, '/packages/reports/index?id=mbti&recordId=private%20a%26b');
  env.navigation[0].fail();
  assert.match(env.toasts[0].title, /再试一次/);
  env.page.openRecord(event);
  assert.equal(env.navigation.length, 2);
  env.page.onHide(); env.page.retakeTest(tap('mbti'));
  assert.equal(env.navigation.length, 2);
  env.page.onShow(); env.page.retakeTest(tap('mbti'));
  assert.equal(env.navigation.at(-1).url, '/pages/test-detail/index?id=mbti');
});

test('a cloud retry that finishes after a hide cannot leave the next visit blocked or clear a newer request', async () => {
  const resolves = [];
  const env = pageFixture([record(1)], { sync: () => new Promise(resolve => resolves.push(resolve)) });
  const old = env.page.retryCloudSync();
  await Promise.resolve();
  assert.equal(env.page.data.cloudRetrying, true);
  env.page.onHide(); env.page.onShow();
  assert.equal(env.page.data.cloudRetrying, false);
  const current = env.page.retryCloudSync();
  await Promise.resolve();
  assert.equal(resolves.length, 2);
  resolves[0]({ state: 'synced', message: '旧请求' });
  await old;
  assert.equal(env.page.data.cloudRetrying, true);
  assert.equal(env.toasts.length, 0);
  resolves[1]({ state: 'pending', message: '稍后重试' });
  await current;
  assert.equal(env.page.data.cloudRetrying, false);
  assert.equal(env.toasts.length, 1);
});

test('synchronous cloud bridge failures still leave the retry button usable with visible feedback', async () => {
  const env = pageFixture([], { sync() { throw new Error('native bridge unavailable'); } });
  await env.page.retryCloudSync();
  assert.equal(env.page.data.cloudRetrying, false);
  assert.equal(env.toasts.length, 1);
  await env.page.retryCloudSync();
  assert.equal(env.syncs(), 2);
});
