const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));

function fixture() {
  const memory = new Map(), calls = [], timers = new Map();
  let timerId = 0, merges = 0;
  let state = {
    seed: 'local-seed', schemaVersion: 1,
    records: [{
      id: 'record-1', testId: 'ie', testVersion: '1', scoringVersion: '2',
      completedAt: '2026-10-29T08:00:00.000Z', scores: { EI: 0 }, resultType: 'I',
      answers: [{ questionId: 1, optionIndex: 1 }], treeSnapshot: { private: 'historic snapshot' }, notes: 'private note'
    }]
  };
  let themeState = { version: 1, selectedId: 'adventurer', starterClaimed: true, unlocked: [{ themeId: 'adventurer', unlockedAt: '2026-10-29T08:00:00.000Z', source: 'starter' }] };
  const wx = {
    getStorageSync: key => memory.has(key) ? clone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, clone(value)),
    cloud: {
      init: value => calls.push({ init: value }),
      async callFunction(options) {
        calls.push(clone(options));
        if (fixtureState.handler) return fixtureState.handler(options);
        if (options.data.action === 'authorizeBackup') return { result: { ok: true } };
        if (options.data.action === 'deleteMyData') return { result: { ok: true, removed: 1 } };
        if (options.data.operation === 'push') return { result: { ok: true, accepted: options.data.records.length, userSeed: 'cloud-seed' } };
        return { result: {
          ok: true, userSeed: 'cloud-seed', records: [{
            id: 'record-1', testId: 'ie', testVersion: '1', scoringVersion: '2',
            completedAt: '2026-10-29T08:00:00.000Z', scores: { EI: 0 }, resultType: 'I', premiumUnlockedAt: '2026-10-29T10:00:00.000Z'
          }], themeState, hasMore: false, nextOffset: 1
        } };
      }
    }
  };
  function load(relative, overrides = {}) {
    const file = path.join(root, relative), module = { exports: {} };
    const nativeRequire = createRequire(file);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, exports: module.exports, wx, console,
      require: name => Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : nativeRequire(name),
      setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id)
    }, { filename: file });
    return module.exports;
  }
  const privacy = load('utils/privacy.js');
  const archive = {
    getArchive: () => clone(state),
    mergeCloudArchive(remote) {
      merges++;
      state.seed = remote.seed;
      remote.records.forEach(record => {
        const local = state.records.find(item => item.id === record.id);
        if (local) Object.assign(local, { premiumUnlockedAt: record.premiumUnlockedAt });
        else state.records.push(clone(record));
      });
      return clone(state);
    }
  };
  const themes = {
    getSyncPayload: () => clone(themeState),
    mergeCloudState: payload => { themeState = clone(payload); }
  };
  const sync = load('utils/cloud-sync.js', { './privacy.js': privacy, './archive.js': archive, './themes.js': themes });
  const fixtureState = {
    sync, privacy, wx, memory, calls, timers, archive, handler: null,
    enable() { privacy.acceptPolicy(); privacy.setCloudBackup(true); },
    get merges() { return merges; },
    setTheme(value) { themeState = clone(value); },
    apiCalls: () => calls.filter(call => call.data)
  };
  return fixtureState;
}

test('default and policy-only consent do not initialize cloud or upload assessment data', async () => {
  const f = fixture();
  f.sync.start(); f.sync.schedule();
  assert.equal((await f.sync.syncArchive()).state, 'disabled');
  f.privacy.acceptPolicy();
  f.sync.start(); f.sync.schedule();
  assert.equal((await f.sync.syncArchive()).state, 'disabled');
  assert.equal(f.calls.length, 0);
  assert.equal(f.timers.size, 0);
});

test('public artwork initialization disables tracing and does not opt into backup', async () => {
  const f = fixture();
  assert.equal(f.sync.initializePublicAssets(), true);
  assert.equal(f.calls[0].init.env, 'cloud1-d2ghbskq3663254ce');
  assert.equal(f.calls[0].init.traceUser, false);
  assert.equal(f.privacy.isCloudBackupEnabled(), false);
  await f.sync.syncArchive();
  assert.equal(f.apiCalls().length, 0);
});

test('explicit backup sends result summaries and theme grants, preserving private local answers and snapshots', async () => {
  const f = fixture(); f.enable();
  const before = f.archive.getArchive();
  const status = await f.sync.syncArchive();
  assert.equal(status.state, 'synced');
  const authorize = f.apiCalls().find(call => call.data.action === 'authorizeBackup');
  assert.ok(authorize.data.consent.id);
  const push = f.apiCalls().find(call => call.data.operation === 'push');
  assert.equal(push.name, 'treehub-api');
  assert.equal(push.data.records[0].id, 'record-1');
  assert.equal(Object.prototype.hasOwnProperty.call(push.data.records[0], 'answers'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(push.data.records[0], 'treeSnapshot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(push.data.records[0], 'notes'), false);
  assert.equal(push.data.themeState.unlocked[0].themeId, 'adventurer');
  const merged = f.archive.getArchive();
  assert.equal(merged.seed, 'cloud-seed');
  assert.deepEqual(merged.records[0].answers, before.records[0].answers);
  assert.deepEqual(merged.records[0].treeSnapshot, before.records[0].treeSnapshot);
  assert.equal(merged.records[0].premiumUnlockedAt, '2026-10-29T10:00:00.000Z');
  const pushes = f.apiCalls().filter(call => call.data.operation === 'push').length;
  await f.sync.syncArchive();
  assert.equal(f.apiCalls().filter(call => call.data.operation === 'push').length, pushes, 'unchanged summaries do not consume another write');
});

test('a theme-only change is backed up without re-uploading unchanged results', async () => {
  const f = fixture(); f.enable();
  await f.sync.syncArchive();
  f.setTheme({ version: 1, selectedId: 'moon', starterClaimed: true, unlocked: [
    { themeId: 'adventurer', unlockedAt: '2026-10-29T08:00:00.000Z', source: 'starter' },
    { themeId: 'moon', unlockedAt: '2026-10-29T10:00:00.000Z', source: 'rewarded-video' }
  ] });
  await f.sync.syncArchive();
  const last = f.apiCalls().filter(call => call.data.operation === 'push').at(-1).data;
  assert.equal(last.records.length, 0);
  assert.equal(last.themeState.selectedId, 'moon');
});

test('a cloud failure leaves the local archive intact and marks synchronization pending', async () => {
  const f = fixture(); f.enable();
  const before = f.archive.getArchive();
  f.handler = async () => { throw new Error('network unavailable'); };
  const status = await f.sync.syncArchive();
  assert.equal(status.state, 'pending');
  assert.match(status.lastError, /network unavailable/);
  assert.deepEqual(f.archive.getArchive(), before);
});

test('revocation during an in-flight upload prevents pull and merge, and deletion drains that request first', async () => {
  const f = fixture(); f.enable();
  let resolvePush, startedPush;
  const pushStarted = new Promise(resolve => { startedPush = resolve; });
  f.handler = options => {
    if (options.data.action === 'authorizeBackup') return Promise.resolve({ result: { ok: true } });
    if (options.data.operation === 'push') {
      startedPush();
      return new Promise(resolve => { resolvePush = resolve; });
    }
    if (options.data.action === 'deleteMyData') return Promise.resolve({ result: { ok: true, removed: 1 } });
    throw new Error('unexpected pull after revocation');
  };
  const uploading = f.sync.syncArchive();
  await pushStarted;
  const deletion = f.sync.deleteCloudData();
  assert.equal(f.apiCalls().some(call => call.data.action === 'deleteMyData'), false);
  resolvePush({ result: { ok: true } });
  await uploading; await deletion;
  assert.equal(f.merges, 0);
  assert.equal(f.apiCalls().some(call => call.data.operation === 'pull'), false);
  assert.equal(f.apiCalls().at(-1).data.action, 'deleteMyData');
  assert.equal(f.privacy.isCloudBackupEnabled(), false);
});

test('failed cloud deletion stays visible and can be retried without re-enabling backup', async () => {
  const f = fixture(); f.enable();
  f.handler = async () => { throw new Error('network unavailable'); };
  await assert.rejects(f.sync.deleteCloudData(), /network unavailable/);
  assert.equal(f.sync.getStatus().state, 'delete_pending');
  assert.equal(f.privacy.isCloudBackupEnabled(), false);
  f.handler = async options => ({ result: { ok: options.data.action === 'deleteMyData', removed: 1 } });
  await f.sync.deleteCloudData();
  assert.equal(f.sync.getStatus().state, 'disabled');
});

test('cloud export includes theme rights and never expands the result field whitelist', async () => {
  const f = fixture();
  const result = await f.sync.exportCloudData();
  assert.equal(result.themeState.selectedId, 'adventurer');
  assert.equal(result.records.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(result.records[0], 'answers'), false);
  assert.equal(f.privacy.isCloudBackupEnabled(), false);
});
