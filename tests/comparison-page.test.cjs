const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { getTest } = require('../data/test-loader.js');
const { scoreTest } = require('../utils/scoring.js');
const { createProfileTest } = require('../utils/profile-scoring.js');
const { buildComparisonModel } = require('../packages/reports/comparison-model.js');
const root = path.resolve(__dirname, '..');

function record(id, testId = 'friendshipstyle', choice = 0, extras = {}) {
  const quiz = getTest(testId);
  return {
    id, testId, testVersion: quiz.testVersion || '1', scoringVersion: '2',
    completedAt: new Date(Date.UTC(2026, 0, choice + 1)).toISOString(),
    ...scoreTest(quiz, quiz.questions, quiz.questions.map(question => question.type === 'ranking'
      ? question.options.map((_, index) => (index + choice) % question.options.length) : choice % question.options.length)),
    ...extras
  };
}

test('comparison selects actual chronological history, supports an older baseline, and never mutates records', () => {
  const recent = record('recent', 'friendshipstyle', 2, { lifeContext: 'work', answers: ['private'], treeSnapshot: { secret: true } });
  const middle = record('middle', 'friendshipstyle', 1);
  const early = record('early', 'friendshipstyle', 0);
  const rows = [early, recent, middle];
  const original = structuredClone(rows);
  const model = buildComparisonModel(getTest('friendshipstyle'), rows);
  assert.equal(model.current.id, 'recent');
  assert.equal(model.previous.id, 'middle');
  assert.equal(model.view.dimensions.length, 4);
  assert.equal(model.view.baselineCount, 2);
  assert.equal(model.view.after.contextLabel, '工作变化');
  assert.ok(model.view.dimensions.every(row => row.delta === row.after - row.before));
  assert.ok(model.view.dimensions.every(row => /百分点|位置相近/.test(row.deltaText)));
  const older = buildComparisonModel(getTest('friendshipstyle'), rows, { recordId: 'recent', previousRecordId: 'early' });
  assert.equal(older.previous.id, 'early');
  assert.equal(older.view.before.date.slice(0, 10), '2026.01.01');
  assert.deepEqual(rows, original);
});

test('explicit foreign, malformed, cross-version or newer IDs never silently fall back to another record', () => {
  const quiz = getTest('friendshipstyle');
  const rows = [record('latest', quiz.id, 2), record('previous', quiz.id, 1), record('oldest', quiz.id, 0)];
  assert.throws(() => buildComparisonModel(quiz, rows, { recordId: 'missing' }), /不在当前设备/);
  assert.throws(() => buildComparisonModel(quiz, rows, { recordId: 'previous', previousRecordId: 'latest' }), /较早记录/);
  assert.throws(() => buildComparisonModel(quiz, rows, { recordId: 'latest', previousRecordId: 'missing' }), /较早记录/);
  for (const invalid of [
    { testVersion: '99' }, { scoringVersion: 'legacy' }, { migrated: true },
    { scores: { scene: 99, novelty: 3, support: 3, ritual: 3 } }, { completedAt: 'bad-date' },
    { resultType: 'not-a-result' }, { premiumUnlockedAt: 'invalid-date' }
  ]) {
    const malformed = { ...rows[0], ...invalid };
    assert.throws(() => buildComparisonModel(quiz, [malformed, ...rows.slice(1)], { recordId: 'latest' }), /版本或分数/);
  }
  assert.throws(() => buildComparisonModel(quiz, [rows[0]]), /同一版本/);
});

test('same-time history honors stable archive order and missing versions retain version one', () => {
  const date = '2026-11-15T12:30:00.000Z';
  const first = record('first', 'friendshipstyle', 0, { completedAt: date });
  const second = record('second', 'friendshipstyle', 1, { completedAt: date });
  delete first.testVersion;
  delete second.testVersion;
  const model = buildComparisonModel(getTest('friendshipstyle'), [second, first]);
  assert.equal(model.current.id, 'second');
  assert.equal(model.previous.id, 'first');
  assert.equal(model.view.intervalLabel, '同一天的两次记录');
  assert.equal(model.view.versionLabel, 'V1');
});

test('classic comparison preserves the existing free two-axis limit and only current-record rights reveal all axes', () => {
  for (const [id, count] of [['mbti', 4], ['bigfive', 5], ['enneagram', 9], ['sbti', 5], ['firstreaction', 5]]) {
    const rows = [record('current', id, 1), record('old', id, 0, { premiumUnlockedAt: '2026-11-01T00:00:00.000Z' })];
    const basic = buildComparisonModel(getTest(id), rows);
    assert.equal(basic.view.dimensions.length, 2, id);
    assert.equal(basic.view.limited, true, id);
    rows[0].premiumUnlockedAt = '2026-11-15T00:00:00.000Z';
    assert.equal(buildComparisonModel(getTest(id), rows).view.dimensions.length, count, id);
    assert.equal(buildComparisonModel(getTest(id), rows).view.limited, false, id);
  }
});

test('classic impossible scores and mismatched types cannot become comparison baselines', () => {
  const cases = [
    ['mbti', { EI: 0, SN: 7, TF: 7, JP: 7 }],
    ['ie', { EI: 15.5 }],
    ['shadow', { shadow: -1 }],
    ['bigfive', { openness: 8, conscientiousness: 8, extraversion: 8, agreeableness: 8, neuroticism: 41 }],
    ['enneagram', { '1': 36, '2': 36, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 }]
  ];
  for (const [id, scores] of cases) {
    const current = record('current', id, 1);
    const previous = record('previous', id, 0, { scores });
    assert.throws(() => buildComparisonModel(getTest(id), [current, previous]), /同一版本/, id);
    assert.throws(() => buildComparisonModel(getTest(id), [current, { ...previous, testVersion: '99' }], { recordId: 'previous' }), /版本或分数/, id);
  }
  const rows = [record('current', 'mbti', 1), record('old', 'mbti', 0, { resultType: 'INFP' })];
  assert.throws(() => buildComparisonModel(getTest('mbti'), rows), /同一版本/);
});

test('enneagram summaries require a possible assignment of one real choice per question', () => {
  const quiz = getTest('enneagram');
  const current = record('current', quiz.id, 1);
  const maximums = Object.fromEntries(quiz.scoring.dimensions.map(id => [String(id),
    quiz.questions.filter(question => question.options.some(option => String(option.value) === String(id))).length]));
  const singleImpossible = { '1': 36, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };
  const jointlyImpossible = { '1': 8, '2': 8, '3': 8, '4': 8, '5': 4, '6': 0, '7': 0, '8': 0, '9': 0 };
  assert.equal(Object.values(jointlyImpossible).reduce((sum, value) => sum + value, 0), quiz.questions.length);
  assert.ok(Object.entries(jointlyImpossible).every(([id, value]) => value <= maximums[id]), 'individual type caps alone would incorrectly accept this total');
  for (const scores of [singleImpossible, jointlyImpossible]) {
    const old = record('old', quiz.id, 0, { scores, resultType: quiz.scoring.resultRule(scores) });
    assert.throws(() => buildComparisonModel(quiz, [current, old]), /同一版本/);
  }
  for (let offset = 0; offset < 8; offset++) {
    const selected = quiz.questions.map((question, index) => (index + offset) % question.options.length);
    const valid = record(`real-${offset}`, quiz.id, 0, scoreTest(quiz, quiz.questions, selected));
    assert.equal(buildComparisonModel(quiz, [current, valid]).previous.id, valid.id, 'real answer choices stay comparable');
  }
});

test('retained profile versions may have different dimensions but never compare across versions', () => {
  const configuration = ids => ({
    id: 'historicalecho', name: '历史版本',
    dimensionMeta: ids.map(id => ({ id, label: id, left: '安静', right: '探索' })),
    questions: ids.map((id, index) => ({ id: index + 1, dim: id, text: id, options: [1, 2, 3, 4].map(value => ({ text: String(value), value })) })),
    profiles: [{ type: 'quiet', title: '安静意象', vector: Object.fromEntries(ids.map(id => [id, 0])), summary: '自评', description: '自评', advice: '观察', strengths: '观察', watchout: '观察', relationship: '沟通', actions: ['观察'] },
      { type: 'active', title: '探索意象', vector: Object.fromEntries(ids.map(id => [id, 100])), summary: '自评', description: '自评', advice: '观察', strengths: '观察', watchout: '观察', relationship: '沟通', actions: ['观察'] }]
  });
  // Use the real historical dimension names so the lightweight archive guard
  // permits their 3..12 domain; retained rules are still independently resolved.
  const ids = ['expression', 'curiosity', 'resolve', 'empathy'];
  const old = createProfileTest({ ...configuration(ids), testVersion: '1',
    questions: ids.flatMap((dim, index) => [0, 1, 2].map(offset => ({ id: index * 3 + offset + 1, dim, text: dim, options: [1, 2, 3, 4].map(value => ({ text: String(value), value })) }))) });
  const latest = createProfileTest({ ...configuration(ids.concat('new')), testVersion: '2', retainedVersions: { '1': old } });
  const make = (id, choice) => ({ id, testId: old.id, testVersion: '1', scoringVersion: '2', completedAt: new Date(Date.UTC(2026, 0, choice + 1)).toISOString(), ...scoreTest(old, old.questions, old.questions.map(() => choice)) });
  const model = buildComparisonModel(latest, [make('now', 1), make('before', 0)]);
  assert.equal(model.view.dimensions.length, 4);
  assert.equal(model.view.versionLabel, 'V1');
});

function pageFixture(records, builder, pendingProvider, pagesProvider) {
  const file = path.join(root, 'packages/reports/compare/index.js');
  const nativeRequire = createRequire(file);
  const requests = [], previews = [], navigation = [], exports = [], updates = [], pendingReads = [];
  let page, archiveReads = 0;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, console,
    getCurrentPages: () => pagesProvider ? pagesProvider() : [],
    wx: {
      setNavigationBarTitle() {}, previewImage(value) { previews.push(value); },
      navigateTo(value) { navigation.push(value); }, redirectTo(value) { navigation.push(value); },
      navigateBack(value) { navigation.push(value); },
      switchTab(value) { navigation.push(value); }, showToast() {}
    },
    require(id) {
      requests.push(id);
      assert.equal(id.includes('data/tests/index'), false);
      if (id.endsWith('/archive.js')) return { getRecords() { archiveReads++; return records; } };
      if (id.endsWith('/premium-access.js')) return { getPendingGrant(recordId) {
        pendingReads.push(recordId); return pendingProvider ? pendingProvider(recordId) : null;
      } };
      if (id.endsWith('/comparison-share-card.js')) return { buildComparisonShareCard(_page, snapshot, isCancelled) {
        exports.push({ snapshot, isCancelled });
        return builder ? builder(snapshot, isCancelled) : Promise.resolve({ path: `/tmp/changes-${exports.length}.jpg` });
      } };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = change => { updates.push(change); Object.assign(page.data, change); };
  return { page, requests, previews, navigation, exports, updates, pendingReads, reads: () => archiveReads };
}

test('page initial view is bounded, loads one test only and pages small baseline summaries on demand', () => {
  const rows = Array.from({ length: 30 }, (_, index) => record(`record-${index}`, 'friendshipstyle', index % 4, {
    completedAt: new Date(Date.UTC(2026, 0, 30 - index)).toISOString(), answers: ['raw-secret'], treeSnapshot: { privateDetail: true }
  }));
  const env = pageFixture(rows);
  env.page.onLoad({ id: 'friendshipstyle', recordId: 'record-0' });
  env.page.onShow();
  assert.equal(env.page.data.state, 'ready');
  assert.equal(env.reads(), 1);
  assert.equal(env.page.data.baselines.length, 0);
  assert.equal(env.exports.length, 0);
  assert.equal(env.requests.some(id => id.endsWith('/comparison-share-card.js')), false);
  for (const secret of ['raw-secret', 'privateDetail', '"scores"', '"answers"', '"treeSnapshot"']) assert.equal(JSON.stringify(env.page.data).includes(secret), false);
  env.page.toggleBaselines();
  assert.equal(env.page.data.baselines.length, 5);
  env.page.loadMoreBaselines();
  assert.equal(env.page.data.baselines.length, 10);
  env.page.selectBaseline({ currentTarget: { dataset: { id: 'record-9' } } });
  assert.equal(env.page.data.before.id, 'record-9');
  assert.equal(env.page.data.pickerOpen, false);
  assert.equal(env.reads(), 1, 'changing baseline reuses the existing archive snapshot');
  env.page.onUnload();
});

test('explicit personal cards contain only permitted projections, are cached, and never become chat covers', async () => {
  const rows = [record('current', 'mbti', 1, { lifeContext: 'breakup', answers: ['raw-secret'] }), record('old', 'mbti', 0)];
  const env = pageFixture(rows);
  env.page.onLoad({ id: 'mbti', recordId: 'current' }); env.page.onShow();
  await env.page.prepareComparisonCard();
  await env.page.prepareComparisonCard();
  assert.equal(env.exports.length, 1);
  const snapshot = env.exports[0].snapshot;
  assert.equal(snapshot.dimensions.length, 2);
  assert.deepEqual(Object.keys(snapshot).sort(), ['afterDate', 'afterTitle', 'beforeDate', 'beforeTitle', 'dimensions', 'note', 'testId', 'testName']);
  assert.equal(/current|breakup|raw-secret|recordId|lifeContext|answers/.test(JSON.stringify(snapshot)), false);
  env.page.previewComparisonCard();
  assert.equal(env.previews.length, 1);
  const share = env.page.onShareAppMessage();
  assert.equal(share.path, '/pages/test-detail/index?id=mbti');
  assert.equal(share.imageUrl, '/assets/share-cover.webp');
  env.page.onUnload();
});

test('completed current-record receipts preserve full comparison while saving is pending and are read once per visit', () => {
  const rows = [record('current', 'mbti', 2), record('before', 'mbti', 1), record('earlier', 'mbti', 0)];
  const env = pageFixture(rows, null, recordId => ({ recordId, completedAt: '2026-11-15T00:00:00.000Z' }));
  env.page.onLoad({ id: 'mbti', recordId: 'current' }); env.page.onShow();
  assert.equal(env.page.data.dimensions.length, 4);
  assert.equal(env.page.data.premiumSavePending, true);
  assert.deepEqual(env.pendingReads, ['current']);
  env.page.selectBaseline({ currentTarget: { dataset: { id: 'earlier' } } });
  assert.deepEqual(env.pendingReads, ['current'], 'changing the baseline does not reread receipt storage');
  assert.equal(env.page.comparisonCardSnapshot().dimensions.length, 4);
  assert.equal('premiumSavePending' in env.page.comparisonCardSnapshot(), false);
  env.page.onHide(); env.page.onShow();
  assert.deepEqual(env.pendingReads, ['current', 'current'], 'returning refreshes the same current record rights');
  env.page.onUnload();
});

test('other-record, partial or malformed receipts and URL-like flags cannot unlock current comparison', () => {
  const rows = [record('current', 'mbti', 1), record('old', 'mbti', 0)];
  for (const receipt of [null, true, { recordId: 'old', completedAt: '2026-11-15' }, { recordId: 'current' }, { recordId: 'current', completedAt: 'bad' }]) {
    const model = buildComparisonModel(getTest('mbti'), rows, { pendingGrantFor: () => receipt, premiumUnlocked: true });
    assert.equal(model.view.dimensions.length, 2);
    assert.equal(model.view.premiumSavePending, false);
  }
  const env = pageFixture(rows, null, () => { throw new Error('storage unavailable'); });
  env.page.onLoad({ id: 'mbti', recordId: 'current', premiumUnlocked: '1', completed: '1' });
  assert.equal(env.page.data.state, 'ready');
  assert.equal(env.page.data.dimensions.length, 2);
  env.page.onUnload();
});

test('a real completed receipt survives archive write failure and remains consistent after later persistence', () => {
  const archive = require('../utils/archive.js');
  const helperPath = require.resolve('../packages/reports/premium-access.js');
  const previousWx = global.wx, previousApp = global.getApp;
  const memory = new Map();
  let failArchiveWrite = false;
  global.getApp = () => ({ globalData: {} });
  global.wx = {
    getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
    setStorageSync(key, value) {
      if (failArchiveWrite && key === archive.STORAGE_KEY) throw new Error('archive storage full');
      memory.set(key, structuredClone(value));
    },
    removeStorageSync: key => memory.delete(key)
  };
  delete require.cache[helperPath];
  const premium = require(helperPath);
  try {
    const quiz = getTest('mbti');
    const save = choice => archive.saveResult({ testId: quiz.id, testVersion: '1', scoringVersion: '2',
      ...scoreTest(quiz, quiz.questions, quiz.questions.map(() => choice)) });
    save(0);
    const current = save(1);
    failArchiveWrite = true;
    premium.rememberCompletedGrant(current.id);
    assert.throws(() => premium.persistPendingGrant(current.id), /保存失败/);
    const rows = archive.getRecords();
    assert.equal(rows[0].premiumUnlockedAt, undefined);
    const env = pageFixture(rows, null, id => premium.getPendingGrant(id));
    env.page.onLoad({ id: 'mbti', recordId: current.id }); env.page.onShow();
    assert.equal(env.page.data.dimensions.length, 4);
    assert.equal(env.page.data.premiumSavePending, true);
    failArchiveWrite = false;
    premium.persistPendingGrant(current.id);
    rows[0] = archive.getRecord(current.id);
    env.page.onHide(); env.page.onShow();
    assert.equal(env.page.data.dimensions.length, 4);
    assert.equal(env.page.data.premiumSavePending, false);
    assert.equal(premium.getPendingGrant(current.id), null);
    env.page.onUnload();
  } finally {
    delete require.cache[helperPath];
    if (previousWx === undefined) delete global.wx; else global.wx = previousWx;
    if (previousApp === undefined) delete global.getApp; else global.getApp = previousApp;
  }
});

test('failed card exports retry and hidden, changed-baseline or disposed exports never update the view', async () => {
  let finish, reject;
  const env = pageFixture([record('now', 'friendshipstyle', 2), record('old', 'friendshipstyle', 1), record('older', 'friendshipstyle', 0)],
    () => new Promise((resolve, failed) => { finish = resolve; reject = failed; }));
  env.page.onLoad({ id: 'friendshipstyle' }); env.page.onShow();
  let pending = env.page.prepareComparisonCard();
  assert.equal(env.page.data.shareBusy, true);
  env.page.prepareComparisonCard();
  assert.equal(env.exports.length, 1);
  reject(new Error('导出失败，可重试')); await pending;
  assert.match(env.page.data.shareError, /可重试/);
  pending = env.page.prepareComparisonCard();
  env.page.onHide(); finish({ path: '/tmp/stale.jpg' }); await pending;
  assert.equal(env.page.data.shareImage, '');
  env.page.onShow();
  assert.equal(env.page.data.shareBusy, false);
  pending = env.page.prepareComparisonCard();
  env.page._options.previousRecordId = 'older'; env.page.loadComparison(true);
  finish({ path: '/tmp/old-baseline.jpg' }); await pending;
  assert.equal(env.page.data.shareImage, '');
  pending = env.page.prepareComparisonCard();
  env.page.onUnload(); finish({ path: '/tmp/disposed.jpg' }); await pending;
  assert.equal(env.page.data.shareImage, '');
  assert.ok(env.exports.at(-1).isCancelled());
});

test('returning from the current report refreshes rights while report links encode exact records and prevent repeated navigation', () => {
  const rows = [record('current?x=1&x=2', 'mbti', 1), record('old', 'mbti', 0)];
  const env = pageFixture(rows);
  env.page.onLoad({ id: 'mbti', recordId: rows[0].id }); env.page.onShow();
  env.page.openReport(); env.page.openReport();
  assert.equal(env.navigation.length, 1);
  assert.equal(env.navigation[0].url, '/packages/reports/index?id=mbti&recordId=current%3Fx%3D1%26x%3D2');
  env.page.onHide(); rows[0].premiumUnlockedAt = '2026-11-15T00:00:00.000Z'; env.page.onShow();
  assert.equal(env.page.data.dimensions.length, 4);
  env.page.openReport({ currentTarget: { dataset: { side: 'before' } } });
  assert.equal(env.navigation.at(-1).url, '/packages/reports/index?id=mbti&recordId=old');
  env.page.onUnload();
});

test('late navigation failure cannot release a newer report or retake navigation lock', () => {
  const env = pageFixture([record('now', 'friendshipstyle', 1), record('before', 'friendshipstyle', 0)]);
  env.page.onLoad({ id: 'friendshipstyle' }); env.page.onShow();
  env.page.openReport();
  const lateReport = env.navigation[0].fail;
  env.page.onHide(); env.page.onShow(); env.page.retake();
  assert.equal(env.navigation.length, 2);
  lateReport(); env.page.openReport();
  assert.equal(env.navigation.length, 2, 'a stale report failure cannot release an active retake lock');
  const lateRetake = env.navigation[1].fail;
  env.page.onHide(); env.page.onShow(); env.page.openReport();
  lateRetake(); env.page.openReport();
  assert.equal(env.navigation.length, 3, 'a stale retake failure cannot release an active report lock');
  env.navigation[2].fail(); env.page.openReport();
  assert.equal(env.navigation.length, 4, 'the active native failure still permits an explicit retry');
  env.page.onUnload();
});

test('opening the exact preceding report reuses it, while a different historical target still opens its own record', () => {
  const rows = [record('current?&=', 'mbti', 1), record('old?&=', 'mbti', 0)];
  const pages = [
    { route: 'packages/reports/index', data: { record: { id: rows[0].id } } },
    { route: 'packages/reports/compare/index' }
  ];
  const env = pageFixture(rows, null, null, () => pages);
  env.page.onLoad({ id: 'mbti', recordId: rows[0].id }); env.page.onShow();
  env.page.openReport(); env.page.openReport();
  assert.equal(env.navigation.length, 1);
  assert.equal(env.navigation[0].delta, 1);
  assert.equal(env.navigation[0].url, undefined);
  env.navigation[0].fail(); env.page.openReport();
  assert.equal(env.navigation.length, 2, 'a native back failure permits an explicit retry');
  env.page.onHide(); env.page.onShow();
  env.page.openReport({ currentTarget: { dataset: { side: 'before' } } });
  assert.equal(env.navigation.length, 3);
  assert.equal(env.navigation[2].url, '/packages/reports/index?id=mbti&recordId=old%3F%26%3D');
  assert.equal(env.navigation[2].delta, undefined, 'the preceding current report cannot replace the selected older report');
  env.page.onHide(); env.page.onShow();
  pages[0].route = 'pages/user-center/index';
  env.page.openReport();
  assert.equal(env.navigation[3].url, '/packages/reports/index?id=mbti&recordId=current%3F%26%3D', 'matching IDs on another page do not trigger back navigation');
  env.page.onUnload();
});

test('thousands of records do not expand the initial view or closed baseline picker', () => {
  const rows = Array.from({ length: 4000 }, (_, index) => record(`history-${index}`, 'friendshipstyle', index % 4, {
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, 4000 - index)).toISOString(),
    answers: ['private-answer'], treeSnapshot: { privateDetail: 'private-tree' }
  }));
  const env = pageFixture(rows);
  env.page.onLoad({ id: 'friendshipstyle' }); env.page.onShow();
  assert.equal(env.page.data.baselineCount, 3999);
  assert.equal(env.page.data.baselines.length, 0);
  assert.ok(Buffer.byteLength(JSON.stringify(env.page.data)) < 8000);
  env.page.toggleBaselines();
  assert.equal(env.page.data.baselines.length, 5);
  assert.ok(Buffer.byteLength(JSON.stringify(env.page.data)) < 10000);
  assert.equal(env.reads(), 1);
  env.page.onUnload();
});
