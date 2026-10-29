const test = require('node:test');
const assert = require('node:assert/strict');

const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const memory = new Map();
global.wx = {
  getStorageSync(key) { return clone(memory.get(key)); },
  setStorageSync(key, value) { memory.set(key, clone(value)); }
};

const archive = require('../utils/archive.js');
const saved = archive.saveResult({
  testId: 'ie', testVersion: '1', scoringVersion: '2',
  scores: { EI: 0 }, resultType: 'I'
});
const remoteRecord = Object.assign({}, clone(saved), { premiumUnlockedAt: '2026-10-29T10:00:00.000Z' });
const calls = [];
let shouldFail = false;

wx.cloud = {
  init(options) { calls.push({ init: options }); },
  async callFunction(options) {
    calls.push(clone(options));
    if (shouldFail) throw new Error('network unavailable');
    if (options.data.operation === 'push') {
      return { result: { ok: true, accepted: options.data.records.length, userSeed: 'cloud-seed' } };
    }
    return {
      result: {
        ok: true, userSeed: 'cloud-seed', records: [remoteRecord],
        hasMore: false, nextOffset: 1
      }
    };
  }
};

const cloudSync = require('../utils/cloud-sync.js');

test('cloud sync binds the configured environment and merges the canonical seed and VIP grant', async () => {
  const status = await cloudSync.syncArchive();
  assert.equal(status.state, 'synced');
  assert.equal(calls[0].init.env, 'cloud1-d2ghbskq3663254ce');
  const push = calls.find(call => call.data && call.data.operation === 'push');
  assert.equal(push.name, 'treehub-api');
  assert.equal(push.data.records[0].id, saved.id);
  const merged = archive.getArchive();
  assert.equal(merged.seed, 'cloud-seed');
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].premiumUnlockedAt, remoteRecord.premiumUnlockedAt);
  const pushesBefore = calls.filter(call => call.data && call.data.operation === 'push').length;
  await cloudSync.syncArchive();
  const pushesAfter = calls.filter(call => call.data && call.data.operation === 'push').length;
  assert.equal(pushesAfter, pushesBefore, 'unchanged records should not consume another cloud write');
});

test('a cloud failure leaves the local archive intact and marks synchronization pending', async () => {
  const before = archive.getArchive();
  shouldFail = true;
  const status = await cloudSync.syncArchive();
  assert.equal(status.state, 'pending');
  assert.match(status.lastError, /network unavailable/);
  assert.deepEqual(archive.getArchive(), before);
});
