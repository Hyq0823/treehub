const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { buildArchiveView } = require('../utils/archive-view.js');
const { isComparableSummary, versionKey, chronologicalEntries, findPreviousRecord } = require('../utils/comparison-records.js');
const root = path.resolve(__dirname, '..');

function record(id, minute = 0, changes = {}) {
  return {
    id, testId: 'mbti', testVersion: '1', scoringVersion: '2', resultType: 'INFP',
    scores: { EI: -3, SN: -3, TF: -3, JP: -3 },
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
    treeSnapshot: { name: '当时的树', stage: { id: 'sprout', name: '初芽' } }, ...changes
  };
}

function fixture(route, records) {
  const file = path.join(root, route + '.js'), nativeRequire = createRequire(file);
  const navigation = [], toasts = [], payloads = [];
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, console,
    getApp: () => ({ globalData: {} }),
    wx: { navigateTo(value) { navigation.push(value); }, showToast(value) { toasts.push(value); }, switchTab(value) { navigation.push(value); } },
    require(id) {
      assert.equal(id.includes('test-loader'), false, 'listing pages must never load a questionnaire');
      assert.equal(id.includes('data/tests/'), false);
      if (id.endsWith('/archive.js')) return { getRecords: () => records, getArchive: () => ({ seed: 'test', records }) };
      if (id.endsWith('/cloud-sync.js')) return { getStatus: () => ({ state: 'idle' }), isAutoSyncFresh: () => true };
      if (id.endsWith('/privacy.js')) return { isCloudBackupEnabled: () => true };
      if (id.endsWith('/tab-bar.js')) return { syncTabBar() {} };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = changes => { payloads.push(changes); Object.assign(page.data, changes); };
  return { page, navigation, toasts, payloads };
}
const event = (id, testId = 'mbti') => ({ currentTarget: { dataset: { id, testId } } });

test('lightweight comparison hints reject broken summaries and normalize a missing first version', () => {
  const valid = record('valid');
  assert.equal(isComparableSummary(valid), true);
  assert.equal(versionKey({ ...valid, testVersion: undefined }), versionKey(valid));
  for (const changes of [
    { testId: 'unknown' }, { migrated: true }, { scoringVersion: 'legacy' }, { testVersion: 'future' },
    { completedAt: 'unknown-date' }, { resultType: 'constructor' }, { scores: {} }, { scores: { EI: Infinity } },
    { testId: 'friendshipstyle', resultType: 'livingroom', scores: { scene: 90, novelty: 6, support: 8, ritual: 6 } }
  ]) {
    assert.equal(isComparableSummary({ ...valid, ...changes }), false);
    assert.equal(versionKey({ ...valid, ...changes }), '');
  }
});

test('chronology uses actual dates, keeps same-time input order and does not create rings from duplicate ids', () => {
  const older = record('older', 1), newest = record('newest', 8), tie = record('tie', 8);
  const rows = [older, newest, tie, record('newest', 2), record('invalid-date', 0, { completedAt: 'broken' })];
  const before = structuredClone(rows);
  assert.deepEqual(chronologicalEntries(rows).map(entry => entry.record.id), ['newest', 'tie', 'older', 'invalid-date']);
  assert.equal(findPreviousRecord(newest, rows).id, tie.id);
  assert.equal(findPreviousRecord(tie, rows).id, older.id);
  assert.equal(findPreviousRecord(record('not-present'), rows), null);
  assert.deepEqual(rows, before);
});

test('archive offers only the displayed latest compatible record and sends tiny comparison ids', () => {
  const first = record('older', 1), second = record('latest?&中文', 3);
  const rows = [first, second];
  const group = buildArchiveView(rows).groups[0];
  assert.equal(group.latest.id, second.id);
  assert.equal(group.comparisonRecordId, second.id);
  assert.equal(group.history.length, 0);
  const payload = JSON.stringify(group);
  for (const key of ['scores', 'answers', 'treeSnapshot', 'previousRecordId']) assert.equal(payload.includes(`"${key}"`), false);
  for (const changes of [
    { migrated: true, scoringVersion: 'legacy' }, { testVersion: '2' }, { testVersion: 'future' }, { scores: { EI: NaN } }
  ]) assert.equal(buildArchiveView([first, second, record('different-latest', 9, changes)]).groups[0].comparisonRecordId, '');
});

test('archive comparison links use the real latest id, protect navigation and ignore stale failures', () => {
  const newest = record('new?&/中文#', 3);
  const env = fixture('pages/user-center/index', [record('old', 1), newest]);
  env.page.onShow();
  env.page.openComparison(event('missing'));
  env.page.openComparison(event('mbti')); env.page.openComparison(event('mbti'));
  assert.equal(env.navigation.length, 1);
  const target = new URL(env.navigation[0].url, 'https://example.invalid');
  assert.equal(target.pathname, '/packages/reports/compare/index');
  assert.equal(target.searchParams.get('id'), 'mbti');
  assert.equal(target.searchParams.get('recordId'), newest.id);
  env.navigation[0].fail();
  assert.equal(env.toasts.length, 1);
  env.page.openComparison(event('mbti'));
  const oldFailure = env.navigation[1].fail;
  env.page.onHide(); env.page.openComparison(event('mbti'));
  assert.equal(env.navigation.length, 2);
  env.page.onShow(); env.page.openComparison(event('mbti'));
  oldFailure(); env.page.openComparison(event('mbti'));
  assert.equal(env.navigation.length, 3, 'an old failure cannot release the current navigation lock');
});

test('history pairs chronological same-version rings while retaining legacy and cloud snapshot labels', () => {
  const rows = [
    record('v2-second', 6, { testVersion: '2', treeSnapshot: { restoredFromSummary: true } }),
    record('v1-first', 1),
    record('v2-first', 3, { testVersion: '2' }),
    record('legacy', 4, { migrated: true, scoringVersion: 'legacy' }),
    record('v1-second', 2),
    record('v2-second', 5, { testVersion: '2' })
  ];
  const env = fixture('pages/tree-history/index', rows);
  env.page.onShow();
  const snapshots = env.page.data.snapshots;
  assert.deepEqual(Array.from(snapshots, row => row.id), ['v2-second', 'legacy', 'v2-first', 'v1-second', 'v1-first']);
  assert.equal(env.page.data.totalCount, 5);
  const newest = snapshots[0];
  assert.equal(newest.ringNumber, 1);
  assert.equal(newest.previousRecordId, 'v2-first');
  assert.equal(newest.canCompare, true);
  assert.equal(newest.tree.restoredFromSummary, true);
  assert.equal(snapshots[1].legacy, true);
  assert.equal(snapshots[1].canCompare, false);
  assert.equal(snapshots[2].versionChanged, true);
  assert.equal(snapshots[2].isRing, false);
  assert.equal(snapshots[3].previousRecordId, 'v1-first');
});

test('same-time history ties remain stable, unsafe rows never become comparison buttons', () => {
  const rows = [record('tie-new', 5), record('tie-old', 5), record('first', 1), record('broken', 6, { scores: {} })];
  const env = fixture('pages/tree-history/index', rows);
  env.page.onShow();
  const byId = new Map(env.page.data.snapshots.map(item => [item.id, item]));
  assert.equal(byId.get('tie-new').ringNumber, 2);
  assert.equal(byId.get('tie-new').previousRecordId, 'tie-old');
  assert.equal(byId.get('tie-old').ringNumber, 1);
  assert.equal(byId.get('broken').canCompare, false);
  assert.equal(byId.get('broken').ringNumber, 0);
});

test('history comparison routes only actual ring pairs, safely encodes ids and can retry navigation', () => {
  const current = record('new?&/中文#', 4), previous = record('old?&/中文#', 1);
  const env = fixture('pages/tree-history/index', [previous, current]);
  env.page.onShow();
  env.page.openComparison(event(current.id, 'ie'));
  env.page.openComparison(event(previous.id));
  assert.equal(env.navigation.length, 0);
  env.page.openComparison(event(current.id)); env.page.openReport(event(current.id));
  assert.equal(env.navigation.length, 1);
  const target = new URL(env.navigation[0].url, 'https://example.invalid');
  assert.equal(target.searchParams.get('recordId'), current.id);
  assert.equal(target.searchParams.get('previousRecordId'), previous.id);
  assert.equal(target.searchParams.get('id'), 'mbti');
  env.navigation[0].fail();
  assert.equal(env.toasts.length, 1);
  env.page.openReport(event(previous.id));
  assert.match(env.navigation[1].url, /^\/packages\/reports\/index/);
  const late = env.navigation[1].fail;
  env.page.onHide(); env.page.openComparison(event(current.id));
  assert.equal(env.navigation.length, 2);
  env.page.onShow(); env.page.openComparison(event(current.id));
  late(); env.page.openComparison(event(current.id));
  assert.equal(env.navigation.length, 3);
});
