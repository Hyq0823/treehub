const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { policyVersion } = require('../config/privacy.js');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));

function fixture() {
  let database = new Map(), openid = 'owner-a', now = Date.parse('2026-11-06T08:00:00.000Z'), queryReads = 0;
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
            queryReads++;
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
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'env', init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }),
    async getTempFileURL({ fileList }) {
      return { fileList: fileList.map(fileID => ({ fileID, status: 0, tempFileURL: `https://cloud.example/${fileID.split('/').pop()}` })) };
    }
  };
  const exports = {};
  class Clock extends Date { static now() { return now; } }
  const file = path.resolve(__dirname, '../cloudfunctions/treehub-api/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    exports, Date: Clock, require: name => name === 'wx-server-sdk' ? cloud : require(name), console: { error() {} }
  }, { filename: file });
  return {
    db,
    get queryReads() { return queryReads; },
    setOwner(value) { openid = value; },
    advance(ms) { now += ms; },
    time: () => new Date(now).toISOString(),
    rows(name) { return clone(Array.from(tables(() => database)(name).values())); },
    async call(action, data = {}) { return clone(await exports.main(Object.assign({ action, clientSchemaVersion: 1, themeRulesVersion: 2 }, data))); },
    async authorize(id = 'consent-device-a-123456') {
      return this.call('authorizeBackup', { consent: { id, policyVersion, acceptedAt: this.time() }, seed: 'seed-local' });
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

test('public theme URLs need no backup consent and expose only the v2 allowlist', async () => {
  const f = fixture();
  const response = await f.call('getThemeAssetUrls', { ids: ['adventurer', 'companions', 'adventurer'] });
  assert.equal(response.ok, true, response.message);
  assert.match(response.urls.adventurer, /adventurer\.webp$/);
  assert.match(response.urls.companions, /companions\.webp$/);
  assert.equal(f.rows('treehub_users').length, 0);
  assert.equal(f.rows('treehub_assessments').length, 0);
  assert.equal((await f.call('getThemeAssetUrls', { ids: ['../private-record'] })).ok, false);
  assert.equal((await f.call('getThemeAssetUrls', { ids: [] })).ok, false);

  const publicAssets = await f.call('getPublicAssetUrls', {
    paths: ['tests/first-reaction/cover.webp', 'tests/first-reaction/order.webp']
  });
  assert.equal(publicAssets.ok, true, publicAssets.message);
  assert.match(publicAssets.urls['tests/first-reaction/cover.webp'], /cover\.webp$/);
  assert.equal((await f.call('getPublicAssetUrls', { paths: ['../private-record.webp'] })).ok, false);
  assert.equal((await f.call('getPublicAssetUrls', { paths: ['tests/first-reaction/../../private.webp'] })).ok, false);
});

test('the current client can authorize default backup after native privacy approval and sync a result', async () => {
  const f = fixture();
  const storage = new Map();
  let nativeAuthorizations = 0;
  class ClientClock extends Date {
    constructor(...args) { super(...(args.length ? args : [f.time()])); }
    static now() { return Date.parse(f.time()); }
  }
  const client = { exports: {} };
  const file = path.resolve(__dirname, '../utils/privacy.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: client, require, Date: ClientClock,
    wx: {
      getStorageSync: key => clone(storage.get(key)),
      setStorageSync: (key, value) => storage.set(key, clone(value)),
      requirePrivacyAuthorize({ success }) { nativeAuthorizations++; success(); }
    }
  }, { filename: file });
  assert.equal(await client.exports.enableCloudBackupByDefault(), true);
  assert.equal(nativeAuthorizations, 1);
  const consent = client.exports.getCloudConsent();
  assert.equal(consent.policyVersion, policyVersion);
  const response = await f.call('authorizeBackup', { consent, seed: 'client-generated-seed' });
  assert.equal(response.ok, true, response.message);
  assert.equal(f.rows('treehub_users')[0].policyVersion, policyVersion);
  const synced = await f.call('syncArchive', { operation: 'push', consentId: consent.id, records: [record()] });
  assert.equal(synced.ok, true, synced.message);
  assert.equal(f.rows('treehub_assessments').length, 1);
});

test('unsupported policy revisions cannot authorize backup or write account data', async () => {
  for (const unsupportedVersion of ['2026-10-30', `${policyVersion}-unknown`, '', undefined]) {
    const f = fixture();
    const response = await f.call('authorizeBackup', {
      consent: { id: 'consent-invalid-policy-123456', policyVersion: unsupportedVersion, acceptedAt: f.time() },
      seed: 'must-not-create-account'
    });
    assert.equal(response.ok, false);
    assert.equal(f.rows('treehub_users').length, 0);
    assert.equal(f.rows('treehub_assessments').length, 0);
  }
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

test('the first-reaction test counts toward cloud exploration-grown themes', async () => {
  const f = fixture(); await f.authorize();
  const aurora = { version: 1, selectedId: 'aurora', starterClaimed: false, unlocked: [{ themeId: 'aurora', source: 'exploration', unlockedAt: f.time() }] };
  const records = ['ie', 'mbti', 'enneagram', 'bigfive', 'firstreaction'].map((id, index) => record(`new-${index}`, id));
  const response = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records, themeState: aurora });
  assert.equal(response.ok, true, response.message);
  assert.equal((await f.call('exportMyData')).themeState.selectedId, 'aurora');
});

test('the server accepts exploration-grown themes only after their matching test', async () => {
  const f = fixture(); await f.authorize();
  const moon = { version: 1, selectedId: 'moon', starterClaimed: false, unlocked: [{ themeId: 'moon', source: 'exploration', unlockedAt: f.time() }] };
  const rejected = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record('r1', 'mbti')], themeState: moon });
  assert.equal(rejected.ok, false);
  const accepted = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record('r2', 'shadow')], themeState: moon });
  assert.equal(accepted.ok, true);
  assert.equal((await f.call('exportMyData')).themeState.unlocked[0].source, 'exploration');
});

test('the quiet observer is a valid free starter theme', async () => {
  const f = fixture(); await f.authorize();
  const response = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [record()], themeState: starter('observer') });
  assert.equal(response.ok, true);
  assert.equal((await f.call('exportMyData')).themeState.selectedId, 'observer');
});

test('basic themes retain their immediate starter grant and also require six, seven or eight unique explorations when earned later', async () => {
  const ids = ['ie', 'mbti', 'enneagram', 'bigfive', 'shadow', 'sbti', 'firstreaction', 'historicalecho'];
  for (const [themeId, count] of [['adventurer', 6], ['romantic', 7], ['observer', 8]]) {
    const f = fixture(); await f.authorize();
    const themeState = { version: 1, selectedId: themeId, starterClaimed: true,
      unlocked: [{ themeId, source: 'exploration', unlockedAt: f.time() }] };
    const tooFew = ids.slice(0, count - 1).map((id, index) => record(`low-${index}`, id));
    const rejected = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: tooFew, themeState });
    assert.equal(rejected.ok, false, `${themeId} cannot be earned early`);
    assert.equal(f.rows('treehub_assessments').length, 0, 'a rejected grant rolls back results too');
    const enough = ids.slice(0, count).map((id, index) => record(`valid-${index}`, id));
    const accepted = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: enough, themeState });
    assert.equal(accepted.ok, true, accepted.message);
    assert.equal((await f.call('exportMyData')).themeState.unlocked[0].source, 'exploration');
  }
});

test('cloud exploration counting scans beyond a page of repeats to restore eight-type basic theme eligibility', async () => {
  const f = fixture(); await f.authorize();
  const olderIds = ['ie', 'mbti', 'enneagram', 'bigfive', 'shadow', 'sbti', 'firstreaction', 'historicalecho'];
  const all = olderIds.map((id, index) => record(`old-${index}`, id)).concat(
    Array.from({ length: 100 }, (_, index) => ({ ...record(`repeat-${index}`, 'ie'), completedAt: '2026-11-01T08:00:00.000Z' }))
  );
  for (let offset = 0; offset < all.length; offset += 20) {
    const uploaded = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: all.slice(offset, offset + 20) });
    assert.equal(uploaded.ok, true, uploaded.message);
  }
  const observer = { version: 1, selectedId: 'observer', starterClaimed: true,
    unlocked: [{ themeId: 'observer', source: 'exploration', unlockedAt: f.time() }] };
  const response = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [], themeState: observer });
  assert.equal(response.ok, true, response.message);
  assert.equal((await f.call('exportMyData')).themeState.selectedId, 'observer');
});

test('cloud exploration counting keeps looking for a theme-specific test beyond eight newer types', async () => {
  const f = fixture(); await f.authorize();
  const newer = ['ie', 'mbti', 'enneagram', 'bigfive', 'sbti', 'firstreaction', 'historicalecho', 'lifepath'];
  const records = [record('older-shadow', 'shadow')].concat(Array.from({ length: 100 }, (_, index) => ({
    ...record(`recent-${index}`, newer[index % newer.length]), completedAt: '2026-11-01T08:00:00.000Z'
  })));
  for (let offset = 0; offset < records.length; offset += 20) {
    const uploaded = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: records.slice(offset, offset + 20) });
    assert.equal(uploaded.ok, true, uploaded.message);
  }
  const moon = { version: 1, selectedId: 'moon', starterClaimed: true,
    unlocked: [{ themeId: 'moon', source: 'exploration', unlockedAt: f.time() }] };
  const response = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456', records: [], themeState: moon });
  assert.equal(response.ok, true, response.message);
  assert.equal((await f.call('exportMyData')).themeState.selectedId, 'moon');
});

test('a free first-theme claim does not scan unrelated repeated history once its one-test condition is met', async () => {
  const f = fixture(); await f.authorize();
  for (let batch = 0; batch < 5; batch++) {
    await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456',
      records: Array.from({ length: 20 }, (_, index) => record(`history-${batch}-${index}`, 'ie')) });
  }
  const before = f.queryReads;
  const response = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456',
    records: [record('first-gift-record', 'ie')], themeState: starter('adventurer') });
  assert.equal(response.ok, true, response.message);
  assert.equal(f.queryReads, before, 'incoming proof meets the claim without a paginated collection read');
});

test('new exploration-earned basic themes remain readable by published clients without downgrading canonical receipts', async () => {
  const f = fixture(); await f.authorize();
  const ids = ['ie', 'mbti', 'enneagram', 'bigfive', 'shadow', 'sbti', 'firstreaction', 'historicalecho'];
  const basic = ['adventurer', 'romantic', 'observer'];
  const themeState = { version: 1, selectedId: 'observer', starterClaimed: true,
    unlocked: basic.concat('moon').map(themeId => ({ themeId, source: 'exploration', unlockedAt: f.time() })) };
  const created = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456',
    records: ids.map((id, index) => record(`coexist-${index}`, id)), themeState });
  assert.equal(created.ok, true, created.message);
  const canonical = () => f.rows('treehub_users')[0].themeState;
  assert.ok(canonical().unlocked.every(grant => grant.source === 'exploration'));
  const legacyAccepts = grant => basic.includes(grant.themeId)
    ? ['starter', 'rewarded-video'].includes(grant.source)
    : ['exploration', 'rewarded-video'].includes(grant.source);
  for (const themeRulesVersion of [undefined, 1, '2']) {
    const pulled = await f.call('syncArchive', { operation: 'pull', consentId: 'consent-device-a-123456', themeRulesVersion });
    assert.equal(pulled.ok, true, pulled.message);
    assert.ok(pulled.themeState.unlocked.every(legacyAccepts), 'published validGrant can read every projected receipt');
    assert.equal(pulled.themeState.unlocked.find(grant => grant.themeId === 'moon').source, 'exploration');
    const exported = await f.call('exportMyData', { themeRulesVersion });
    assert.deepEqual(exported.themeState, pulled.themeState, 'export and pull apply the same compatibility projection');
    assert.ok(canonical().unlocked.every(grant => grant.source === 'exploration'), 'read projection never modifies stored sources');
  }
  const legacy = await f.call('syncArchive', { operation: 'pull', consentId: 'consent-device-a-123456', themeRulesVersion: undefined });
  legacy.themeState.unlocked[0].unlockedAt = '2026-11-05T00:00:00.000Z';
  const reuploaded = await f.call('syncArchive', { operation: 'push', consentId: 'consent-device-a-123456',
    themeRulesVersion: undefined, records: [], themeState: legacy.themeState });
  assert.equal(reuploaded.ok, true, reuploaded.message);
  const modern = await f.call('syncArchive', { operation: 'pull', consentId: 'consent-device-a-123456', themeRulesVersion: 2 });
  assert.ok(modern.themeState.unlocked.every(grant => grant.source === 'exploration'), 'legacy roundtrip cannot change the canonical acquisition source');
  assert.equal(modern.themeState.unlocked[0].unlockedAt, '2026-11-05T00:00:00.000Z');
  const modernExport = await f.call('exportMyData', { themeRulesVersion: 2 });
  assert.deepEqual(modernExport.themeState, modern.themeState);
  const legacyAuthorization = await f.call('authorizeBackup', {
    themeRulesVersion: undefined, consent: { id: 'consent-legacy-device-123456', policyVersion, acceptedAt: f.time() }, seed: 'another-device'
  });
  assert.equal(legacyAuthorization.ok, true);
  assert.ok(canonical().unlocked.every(grant => grant.source === 'exploration'));
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
  const delayed = await f.call('authorizeBackup', { consent: { id: 'consent-delayed-device-123456', policyVersion, acceptedAt: delayedAcceptedAt }, seed: 'must-not-restore' });
  assert.equal(delayed.ok, false);
  assert.match(delayed.message, /早于云端删除/);
  assert.equal(f.rows('treehub_assessments').length, 0);
  f.advance(1000);
  assert.equal((await f.authorize('consent-new-choice-123456')).ok, true, 'a new explicit choice can create a fresh backup');
});

test('obviously future-dated authorization is rejected rather than bypassing a deletion cutoff', async () => {
  const f = fixture();
  const response = await f.call('authorizeBackup', { consent: { id: 'consent-future-date-123456', policyVersion, acceptedAt: '2036-10-30T08:00:00.000Z' }, seed: 'seed' });
  assert.equal(response.ok, false);
  assert.equal(f.rows('treehub_users').length, 0);
});
