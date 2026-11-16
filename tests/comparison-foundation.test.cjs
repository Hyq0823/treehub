const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { getTest } = require('../data/test-loader.js');
const { scoreTest } = require('../utils/scoring.js');
const { buildComparison } = require('../packages/reports/deep-report.js');

function record(quiz, choice) {
  return { testId: quiz.id, testVersion: quiz.testVersion || '1', scoringVersion: '2',
    ...scoreTest(quiz, quiz.questions, quiz.questions.map(() => choice)) };
}

test('enneagram retests keep an unchanged vote count stable even when the leading count changes', () => {
  const quiz = getTest('enneagram');
  const first = { '1': 4, '2': 8, '3': 4, '4': 4, '5': 4, '6': 3, '7': 3, '8': 3, '9': 3 };
  const second = { ...first, '2': 6, '3': 6 };
  const make = scores => ({ testId: quiz.id, testVersion: '1', scoringVersion: '2', scores, resultType: quiz.scoring.resultRule(scores) });
  const comparison = buildComparison(quiz, make(second), make(first));
  const unchanged = comparison.changes.find(item => item.id === '1');
  assert.equal(unchanged.before, 11);
  assert.equal(unchanged.after, 11);
  assert.equal(unchanged.delta, 0);
  assert.equal(unchanged.unit, '百分点');
  assert.match(comparison.note, /相同题数.*选择占比/);
  assert.match(comparison.headline, /个百分点/);
  assert.ok(comparison.changes.every(item => item.delta === item.after - item.before));
  assert.equal(buildComparison(quiz, make({ ...second, '9': 0 }), make(first)), null, 'incomplete votes cannot synthesize a comparison');
});

test('comparisons reject unrelated tests, migrated records and unknown versions and use percentage points', () => {
  const quiz = getTest('ie'), before = record(quiz, 1), after = record(quiz, 0);
  assert.equal(buildComparison(quiz, after, before).changes[0].deltaText, '+100 个百分点');
  for (const patch of [
    { testId: 'mbti' }, { migrated: true }, { scoringVersion: 'legacy' }, { testVersion: 'future' }
  ]) assert.equal(buildComparison(quiz, { ...after, ...patch }, before), null);
  assert.equal(buildComparison(quiz, { ...after, testVersion: 'future' }, { ...before, testVersion: 'future' }), null);
  assert.equal(buildComparison(getTest('mbti'), after, before), null);
  const missingVersions = [{ ...after }, { ...before }];
  missingVersions.forEach(item => delete item.testVersion);
  assert.ok(buildComparison(quiz, ...missingVersions), 'versionless modern summaries retain their original v1 meaning');
});

function reportPage() {
  const file = path.resolve(__dirname, '../packages/reports/index.js');
  const nativeRequire = createRequire(file), navigations = [], toasts = [];
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, require: id => id.endsWith('/track.js') ? { report() {}, EVENTS: {} } : nativeRequire(id),
    wx: { navigateTo(value) { navigations.push(value); }, showToast(value) { toasts.push(value); } },
    console, setTimeout, clearTimeout
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = update => Object.assign(page.data, update);
  Object.assign(page.data, { test: { id: 'friendshipstyle', name: '友情里的你' },
    record: { id: 'current?&=', lifeContext: 'breakup' }, result: { title: '自在老友' },
    comparison: { currentLabel: '分手后' } });
  page._comparisonPreviousId = 'previous?&=';
  page._disposed = false;
  return { page, navigations, toasts };
}

test('report comparison navigates to exact private record IDs once and failed navigation can retry', () => {
  const env = reportPage();
  env.page.openComparison(); env.page.openComparison();
  assert.equal(env.navigations.length, 1);
  const target = new URL(env.navigations[0].url, 'https://example.invalid');
  assert.equal(target.pathname, '/packages/reports/compare/index');
  assert.equal(target.searchParams.get('recordId'), 'current?&=');
  assert.equal(target.searchParams.get('previousRecordId'), 'previous?&=');
  env.navigations[0].fail(); env.page.openComparison();
  assert.equal(env.navigations.length, 2);
  env.page.onHide(); env.navigations[1].fail(); env.page.openComparison();
  assert.equal(env.toasts.length, 1, 'hidden native errors remain silent');
  env.page.onShow(); env.page.data.adWatching = true; env.page.openComparison();
  assert.equal(env.navigations.length, 2);
  env.page.data.adWatching = false; env.page._disposed = true; env.page.openComparison();
  assert.equal(env.navigations.length, 2);
});

test('ordinary report sharing does not turn a private life event into the share title or path', () => {
  const env = reportPage();
  for (const test of [{ id: 'friendshipstyle', name: '友情里的你' }, { id: 'ie', name: 'i人/e人测试' }]) {
    env.page.data.test = test;
    const shared = env.page.onShareAppMessage();
    assert.doesNotMatch(shared.title + shared.path, /分手|breakup|current|previous|recordId/);
    assert.equal(shared.path, `/pages/test-detail/index?id=${test.id}`);
  }
});
