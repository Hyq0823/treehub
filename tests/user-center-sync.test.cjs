const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../pages/user-center/index.js');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function loadPage(ready) {
  let definition;
  const app = { globalData: { cloudBackupReady: ready } };
  const stubs = {
    '../../utils/archive.js': {},
    '../../utils/cloud-sync.js': {},
    '../../utils/privacy.js': {},
    '../../utils/personality-tree.js': { getTree() {} },
    '../../data/trees.js': { STAGES: [] },
    '../../data/test-catalog.js': { catalog: [], resolveResultTitle() { return ''; } },
    '../../utils/tab-bar.js': { syncTabBar() {} }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { definition = value; },
    require: name => stubs[name],
    wx: {}, getApp: () => app, console, Promise
  }, { filename: file });
  definition.data = structuredClone(definition.data);
  definition.setData = changes => Object.assign(definition.data, changes);
  let archives = 0, refreshes = 0;
  definition.loadArchive = () => { archives++; };
  definition.refreshCloud = () => { refreshes++; return Promise.resolve({ state: 'synced' }); };
  return { page: definition, counts: () => ({ archives, refreshes }) };
}

test('档案页等待默认备份初始化后只自动同步一次', async () => {
  const gate = deferred();
  const { page, counts } = loadPage(gate.promise);
  page.onShow();
  assert.deepEqual(counts(), { archives: 1, refreshes: 0 });
  gate.resolve(true);
  await gate.promise;
  await Promise.resolve();
  assert.deepEqual(counts(), { archives: 1, refreshes: 1 });
});

test('没有初始化 Promise 时档案页立即同步一次', () => {
  const { page, counts } = loadPage(null);
  page.onShow();
  assert.deepEqual(counts(), { archives: 1, refreshes: 1 });
});

test('迟到的初始化结果不会刷新已离开的或旧一轮页面', async () => {
  const gate = deferred();
  const { page, counts } = loadPage(gate.promise);
  page.onShow();
  page.onHide();
  page.onShow();
  gate.resolve(true);
  await gate.promise;
  await Promise.resolve();
  assert.deepEqual(counts(), { archives: 2, refreshes: 1 });
});

test('自动进入复用五分钟内状态，手动重试仍强制请求云端', async () => {
  let definition, syncs = 0;
  const status = { state: 'synced', message: '已同步', lastSyncedAt: new Date().toISOString() };
  const stubs = {
    '../../utils/archive.js': {},
    '../../utils/cloud-sync.js': {
      isAutoSyncFresh: () => true,
      getStatus: () => status,
      syncArchive: async () => { syncs++; return status; }
    },
    '../../utils/privacy.js': { isCloudBackupEnabled: () => true },
    '../../utils/personality-tree.js': { getTree() {} },
    '../../data/trees.js': { STAGES: [] },
    '../../data/test-catalog.js': { catalog: [], resolveResultTitle() { return ''; } }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { definition = value; },
    require: name => stubs[name],
    wx: { showToast() {} }, getApp: () => ({ globalData: {} }), console, Promise
  }, { filename: file });
  definition.data = structuredClone(definition.data);
  definition.setData = changes => Object.assign(definition.data, changes);
  definition.loadArchive = () => {};
  definition._hidden = false;

  await definition.refreshCloud({ reuseFresh: true });
  assert.equal(syncs, 0);
  assert.equal(definition.data.cloudState, 'synced');
  await definition.retryCloudSync();
  assert.equal(syncs, 1);
});
