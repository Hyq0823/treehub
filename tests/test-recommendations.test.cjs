const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { catalog } = require('../data/test-catalog.js');
const { recommendTests } = require('../utils/test-recommendations.js');
const completed = id => ({ testId: id, scoringVersion: '2' });

test('recommendations connect relation and recovery quizzes and prioritize unexplored tests', () => {
  const initial = recommendTests('relationshiprhythm', []);
  assert.deepEqual(initial.map(item => item.id), ['friendshipstyle', 'gentleboundaries']);
  const next = recommendTests('relationshiprhythm', [completed('gentleboundaries')]);
  assert.equal(next[0].id, 'friendshipstyle', 'friendship is an explicit path from intimate relationships');
  assert.equal(next[1].id, 'emotionalrecharge');
  assert.ok(next.every(item => !item.repeat && item.id !== 'relationshiprhythm'));
  const all = catalog.map(item => completed(item.id));
  assert.ok(recommendTests('relationshiprhythm', all).every(item => item.repeat));
  for (const quiz of catalog) {
    const suggested = recommendTests(quiz.id, all);
    assert.equal(suggested.length, 2);
    assert.equal(new Set(suggested.map(item => item.id)).size, 2);
    assert.ok(suggested.every(item => item.id !== quiz.id));
    assert.ok(suggested.every(item => item.title && item.time && item.questionsCount));
    assert.equal(suggested.some(item => 'scores' in item || 'recordId' in item || 'answers' in item), false);
  }
});

test('friendship recommendations invite boundaries and recovery without exposing a friend identity or private answers', () => {
  const initial = recommendTests('friendshipstyle', []);
  assert.deepEqual(initial.map(item => item.id), ['gentleboundaries', 'emotionalrecharge']);
  const next = recommendTests('friendshipstyle', [completed('gentleboundaries')]);
  assert.equal(next[0].id, 'emotionalrecharge');
  assert.ok(next.every(item => !item.repeat && item.id !== 'friendshipstyle'));
  assert.ok(initial.every(item => Object.keys(item).every(key =>
    ['id', 'title', 'prompt', 'symbol', 'time', 'questionsCount', 'repeat'].includes(key))));
});

test('invalid recommendation inputs do not expose routes or mark legacy assessments as completed', () => {
  for (const id of [null, undefined, '__proto__', 'constructor', '../tests/mbti', 'unknown']) {
    assert.deepEqual(recommendTests(id, []), []);
  }
  const legacy = { testId: 'gentleboundaries', scoringVersion: 'legacy' };
  assert.equal(recommendTests('relationshiprhythm', [legacy])[0].repeat, false);
  assert.deepEqual(recommendTests('relationshiprhythm', [], 0), []);
});

function reportNavigationFixture(hasDraft = false) {
  const file = path.resolve(__dirname, '../packages/reports/index.js');
  const nativeRequire = createRequire(file);
  const redirects = [], requests = [], draftReads = [], toasts = [];
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, require(id) {
      requests.push(id);
      if (id === '../../utils/answer-drafts.js') return { hasPendingDraft(testId) { draftReads.push(testId); return hasDraft; } };
      return nativeRequire(id);
    },
    wx: { redirectTo(value) { redirects.push(value); }, showToast(value) { toasts.push(value); } }, console
  }, { filename: file });
  page.data.relatedTests = recommendTests('relationshiprhythm', []);
  page._disposed = false;
  return { page, redirects, requests, draftReads, toasts };
}

test('continuing from a report replaces its page and carries only a public test ID and ordinary context', () => {
  const { page, redirects, requests, draftReads } = reportNavigationFixture();
  assert.equal(requests.includes('../../utils/answer-drafts.js'), false, 'report module does not read drafts before an explicit tap');
  page.openRelatedTest({ currentTarget: { dataset: { id: 'gentleboundaries' } } });
  assert.equal(redirects[0].url, '/pages/test-answer/index?id=gentleboundaries&context=ordinary');
  assert.deepEqual(draftReads, ['gentleboundaries']);
  assert.doesNotMatch(redirects[0].url, /recordId|scores|answers/);
  page.openRelatedTest({ currentTarget: { dataset: { id: 'emotionalrecharge' } } });
  assert.equal(redirects.length, 1, 'rapid taps cannot stack multiple replacements');
  page._openingRelated = false;
  page.openRelatedTest({ currentTarget: { dataset: { id: '../unexpected' } } });
  page.data.adWatching = true;
  page.openRelatedTest({ currentTarget: { dataset: { id: 'emotionalrecharge' } } });
  page.data.adWatching = false;
  page._disposed = true;
  page.openRelatedTest({ currentTarget: { dataset: { id: 'emotionalrecharge' } } });
  assert.equal(redirects.length, 1);
});


test('a pending related-test draft routes to its detail page for an explicit resume choice', () => {
  const { page, redirects, draftReads } = reportNavigationFixture(true);
  page.openRelatedTest({ currentTarget: { dataset: { id: 'gentleboundaries' } } });
  assert.equal(redirects[0].url, '/pages/test-detail/index?id=gentleboundaries');
  assert.doesNotMatch(redirects[0].url, /context|resume|recordId|scores|answers/);
  assert.deepEqual(draftReads, ['gentleboundaries']);
  page.openRelatedTest({ currentTarget: { dataset: { id: 'emotionalrecharge' } } });
  assert.equal(redirects.length, 1);
  assert.equal(draftReads.length, 1);
});

test('related navigation errors release the guard so draft choices remain retryable', () => {
  const { page, redirects, toasts } = reportNavigationFixture(true);
  const event = { currentTarget: { dataset: { id: 'gentleboundaries' } } };
  page.openRelatedTest(event);
  redirects[0].fail();
  assert.equal(page._openingRelated, false);
  assert.equal(toasts.length, 1);
  page.openRelatedTest(event);
  assert.equal(redirects.length, 2);
  page._disposed = true;
  redirects[1].fail();
  assert.equal(toasts.length, 1, 'leaving the report must not display late feedback');
});

test('unavailable local draft storage safely behaves like a fresh exploration', () => {
  const prior = global.wx;
  try {
    global.wx = { getStorageSync() { throw new Error('storage unavailable'); } };
    const { hasPendingDraft } = require('../utils/answer-drafts.js');
    assert.equal(hasPendingDraft('gentleboundaries'), false);
  } finally { if (prior === undefined) delete global.wx; else global.wx = prior; }
});
