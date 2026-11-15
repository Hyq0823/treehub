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
  assert.deepEqual(initial.map(item => item.id), ['gentleboundaries', 'emotionalrecharge']);
  const next = recommendTests('relationshiprhythm', [completed('gentleboundaries')]);
  assert.equal(next[0].id, 'emotionalrecharge');
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

test('invalid recommendation inputs do not expose routes or mark legacy assessments as completed', () => {
  for (const id of [null, undefined, '__proto__', 'constructor', '../tests/mbti', 'unknown']) {
    assert.deepEqual(recommendTests(id, []), []);
  }
  const legacy = { testId: 'gentleboundaries', scoringVersion: 'legacy' };
  assert.equal(recommendTests('relationshiprhythm', [legacy])[0].repeat, false);
  assert.deepEqual(recommendTests('relationshiprhythm', [], 0), []);
});

test('continuing from a report replaces its page and carries only a public test ID and ordinary context', () => {
  const file = path.resolve(__dirname, '../packages/reports/index.js');
  const nativeRequire = createRequire(file);
  const redirects = [];
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, require: nativeRequire,
    wx: { redirectTo(value) { redirects.push(value.url); } }, console
  }, { filename: file });
  page.data.relatedTests = recommendTests('relationshiprhythm', []);
  page._disposed = false;
  page.openRelatedTest({ currentTarget: { dataset: { id: 'gentleboundaries' } } });
  assert.equal(redirects[0], '/pages/test-answer/index?id=gentleboundaries&context=ordinary');
  assert.doesNotMatch(redirects[0], /recordId|scores|answers/);
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
