const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));

function fixture() {
  let database = new Map(), openid = 'owner-a', now = Date.parse('2026-10-30T08:00:00.000Z');
  const tables = source => name => {
    if (!source().has(name)) source().set(name, new Map());
    return source().get(name);
  };
  function collection(name, source = () => database) {
    const table = () => tables(source)(name);
    return {
      doc(id) {
        return {
          async get() { if (!table().has(id)) throw new Error('document does not exist'); return { data: clone(table().get(id)) }; },
          async set({ data }) { table().set(id, Object.assign(clone(data), { _id: id })); return {}; },
          async update({ data }) { if (!table().has(id)) throw new Error('document does not exist'); Object.assign(table().get(id), clone(data)); return { stats: { updated: 1 } }; },
          async remove() { table().delete(id); return {}; }
        };
      },
      where(criteria) {
        let offset = 0, limit = 100, order;
        const query = {
          orderBy(field, direction) { order = { field, direction }; return query; },
          skip(value) { offset = value; return query; }, limit(value) { limit = value; return query; },
          async get() {
            let values = Array.from(table().values()).filter(value => Object.entries(criteria).every(([key, expected]) => value[key] === expected));
            if (order) values.sort((a, b) => String(a[order.field]).localeCompare(String(b[order.field])) * (order.direction === 'desc' ? -1 : 1));
            return { data: clone(values.slice(offset, offset + limit)) };
          }
        };
        return query;
      }
    };
  }
  const db = {
    collection,
    serverDate: () => new Date(now).toISOString(),
    async runTransaction(callback) {
      const next = new Map(Array.from(database, ([name, docs]) => [name, new Map(Array.from(docs, ([id, data]) => [id, clone(data)]))]));
      const result = await callback({ collection: name => collection(name, () => next) });
      database = next;
      return result;
    }
  };
  const cloud = { DYNAMIC_CURRENT_ENV: 'env', init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }) };
  const exports = {};
  class Clock extends Date { static now() { return now; } }
  const file = path.resolve(__dirname, '../cloudfunctions/treehub-api/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    exports, Date: Clock, require: name => name === 'wx-server-sdk' ? cloud : require(name), console: { error() {} }
  }, { filename: file });
  return {
    db,
    setOwner(value) { openid = value; },
    advance(ms) { now += ms; },
    time: () => new Date(now).toISOString(),
    rows(name) { return clone(Array.from(tables(() => database)(name).values())); },
    async call(action, data = {}) { return clone(await exports.main(Object.assign({ action, clientSchemaVersion: 1 }, data))); },
    async authorize(id = 'consent-device-a-123456') {
      return this.call('authorizeBackup', { consent: { id, policyVersion: '2026-10-30', acceptedAt: this.time() }, seed: 'seed-local' });
    }
  };
}

function record(id = 'record-a', testId = 'ie') {
  return {
    id, testId, testVersion: '1', scoringVersion: '2', completedAt: '2026-10-29T08:00:00.000Z',
    scores: { EI: 0 }, resultType: 'I', answers: [{ questionId: 1, optionIndex: 1 }], treeSnapshot: { hidden: true }, privateNote: 'sensitive text'
  };
}
const starter = (themeId = 'adventurer') => ({ version: 1, selectedId: themeId, starterClaimed: true, unlocked: [{ themeId, source: 'starter', unlockedAt: '2026-10-30T08:00:00.000Z' }] });

test('server refuses legacy automatic backup without a separate current consent session', async () => {
  const f = fixture();
  const response = await f.call('syncArchive', { operation: 'push', seed: 'seed', records: [record()] });
  assert.equal(response.ok, false);
  assert.equal(f.rows('treehub_assessments').length, 0);
});

test('owner-scoped result backup strips answers and snapshots and never exports another account', async () => {
  const f = fixture();
  assert.equal((await f.authorize()).ok, true);
  assert.equal((await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()], themeState: starter() })).ok, true);
  const stored = f.rows('treehub_assessments')[0];
  for (const field of ['answers', 'treeSnapshot', 'privateNote']) assert.equal(Object.prototype.hasOwnProperty.call(stored, field), false);
  const mine = await f.call('exportMyData');
  assert.equal(mine.records.length, 1);
  assert.equal(mine.themeState.unlocked[0].themeId, 'adventurer');
  assert.equal(Object.prototype.hasOwnProperty.call(mine.records[0], 'owner'), false);
  f.setOwner('owner-b');
  const other = await f.call('exportMyData', { owner: 'owner-a', openid: 'owner-a' });
  assert.equal(other.records.length, 0);
  await f.call('deleteMyData', { owner: 'owner-a' });
  f.setOwner('owner-a');
  assert.equal((await f.call('exportMyData')).records.length, 1);
});

test('updating entitlement preserves canonical historical scores and removes legacy raw fields', async () => {
  const f = fixture(); await f.authorize();
  await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()] });
  const stored = f.rows('treehub_assessments')[0];
  await f.db.collection('treehub_assessments').doc(stored._id).update({ data: { answers: ['legacy private'], treeSnapshot: { legacy: true } } });
  const changed = Object.assign(record(), { scores: { EI: 15 }, resultType: 'E', premiumUnlockedAt: '2026-10-29T12:00:00.000Z' });
  await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [changed] });
  const current = f.rows('treehub_assessments')[0];
  assert.deepEqual(current.scores, { EI: 0 });
  assert.equal(current.resultType, 'I');
  assert.equal(current.premiumUnlockedAt, changed.premiumUnlockedAt);
  assert.equal(Object.prototype.hasOwnProperty.call(current, 'answers'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(current, 'treeSnapshot'), false);
});

test('authorized pull cleans previously stored raw answers even on a new device with no local copy', async () => {
  const f = fixture(); await f.authorize();
  await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()] });
  const stored = f.rows('treehub_assessments')[0];
  await f.db.collection('treehub_assessments').doc(stored._id).update({ data: {
    schemaVersion: 1, answers: ['previously uploaded raw choices'], treeSnapshot: { legacy: true }, privateNote: 'legacy extra'
  } });
  const safeExport = await f.call('exportMyData');
  assert.equal(Object.prototype.hasOwnProperty.call(safeExport.records[0], 'answers'), false);
  const pulled = await f.call('syncArchive', { operation: 'pull', consentId: 'consent-device-a-123456' });
  assert.equal(pulled.ok, true);
  assert.equal(pulled.sanitizedLegacyRecords, 1);
  const current = f.rows('treehub_assessments')[0];
  assert.deepEqual(current.scores, stored.scores);
  for (const field of ['answers', 'treeSnapshot', 'privateNote']) assert.equal(Object.prototype.hasOwnProperty.call(current, field), false);
});

test('the hidden theme requires five distinct current-version explorations on the server', async () => {
  const f = fixture(); await f.authorize();
  const aurora = { version: 1, selectedId: 'aurora', starterClaimed: false, unlocked: [{ themeId: 'aurora', source: 'rewarded-video', unlockedAt: f.time() }] };
  const early = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()], themeState: aurora });
  assert.equal(early.ok, false);
  assert.match(early.message, /五类/);
  assert.equal(f.rows('treehub_assessments').length, 0, 'invalid hidden grant rolls back its transaction');
  const valid = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: ['ie', 'mbti', 'enneagram', 'bigfive', 'shadow'].map((id, index) => record(`r${index}`, id)), themeState: aurora });
  assert.equal(valid.ok, true);
  assert.equal((await f.call('exportMyData')).themeState.selectedId, 'aurora');
});

test('two legitimate starter choices on separate offline devices merge without blocking report recovery', async () => {
  const f = fixture(); await f.authorize('consent-device-a-123456');
  await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()], themeState: starter('adventurer') });
  await f.authorize('consent-device-b-123456');
  const response = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-b-123456', records: [record('record-b')], themeState: starter('romantic') });
  assert.equal(response.ok, true);
  const restored = await f.call('exportMyData');
  assert.equal(restored.records.length, 2);
  assert.deepEqual(restored.themeState.unlocked.map(grant => grant.themeId).sort(), ['adventurer', 'romantic']);
});

test('deletion removes result data, seed and themes and rejects old or delayed pre-deletion consent', async () => {
  const f = fixture();
  const delayedAcceptedAt = f.time();
  await f.authorize();
  await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()], themeState: starter() });
  f.advance(1000);
  assert.equal((await f.call('deleteMyData')).ok, true);
  const after = await f.call('exportMyData');
  assert.equal(after.records.length, 0);
  assert.equal(after.userSeed, '');
  assert.equal(after.themeState, undefined);
  const tombstone = f.rows('treehub_users')[0];
  for (const field of ['owner', 'seed', 'scores', 'themeState', 'consentHashes']) assert.equal(Object.prototype.hasOwnProperty.call(tombstone, field), false);
  const replay = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()] });
  assert.equal(replay.ok, false);
  const delayed = await f.call('authorizeBackup', { consent: { id: 'consent-delayed-device-123456', policyVersion: '2026-10-30', acceptedAt: delayedAcceptedAt }, seed: 'must-not-restore' });
  assert.equal(delayed.ok, false);
  assert.equal(f.rows('treehub_assessments').length, 0);
  f.advance(1000);
  assert.equal((await f.authorize('consent-new-choice-123456')).ok, true, 'a new explicit choice can create a fresh backup');
});

test('obviously future-dated authorization is rejected rather than bypassing a deletion cutoff', async () => {
  const f = fixture();
  const response = await f.call('authorizeBackup', { consent: { id: 'consent-future-date-123456', policyVersion: '2026-10-30', acceptedAt: '2036-10-30T08:00:00.000Z' }, seed: 'seed' });
  assert.equal(response.ok, false);
  assert.equal(f.rows('treehub_users').length, 0);
});
