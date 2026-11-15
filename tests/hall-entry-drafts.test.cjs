const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function fixture(pending) {
  const file = path.resolve(__dirname, '../pages/test-hall/index.js');
  const nativeRequire = createRequire(file);
  const navigations = [], requests = [];
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, console, setTimeout, clearTimeout,
    wx: { navigateTo(value) { navigations.push(value.url); } },
    require(id) {
      requests.push(id);
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id.endsWith('/answer-drafts.js')) return { hasPendingDraft: testId => pending && testId === 'firstreaction' };
      assert.equal(id.includes('test-loader'), false);
      assert.equal(id.includes('data/tests/'), false);
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.data.cards = [{ id: 'firstreaction', quickStart: true, collected: false }];
  page.data.recommendation = page.data.cards[0];
  page.data.rewardTargetTestId = 'firstreaction';
  return { page, requests, navigations };
}

test('quick-entry cards, next exploration and theme goal offer an existing draft through detail', () => {
  const env = fixture(true);
  assert.equal(env.requests.some(id => id.endsWith('/answer-drafts.js')), false, 'draft reading stays out of hall startup');
  env.page.openTest({ currentTarget: { dataset: { id: 'firstreaction' } } });
  env.page.exploreNext();
  env.page.exploreReward();
  assert.deepEqual(env.navigations, Array(3).fill('/pages/test-detail/index?id=firstreaction'));
  assert.ok(env.navigations.every(url => !/answers|recordId|resume|work|breakup/.test(url)));
});

test('fresh quick-entry tests retain direct ordinary answering', () => {
  const env = fixture(false);
  env.page.openTest({ currentTarget: { dataset: { id: 'firstreaction' } } });
  env.page.exploreNext(); env.page.exploreReward();
  assert.deepEqual(env.navigations, Array(3).fill('/pages/test-answer/index?id=firstreaction&context=ordinary'));
});

test('existing result links retain their record, and regular detail entries do not read drafts on hall', () => {
  const env = fixture(true);
  env.page.data.cards = [
    { id: 'firstreaction', quickStart: true, collected: true, recordId: 'record?x=1&x=2' },
    { id: 'mbti', quickStart: false, collected: false }
  ];
  env.page.openTest({ currentTarget: { dataset: { id: 'firstreaction' } } });
  env.page.openTest({ currentTarget: { dataset: { id: 'mbti' } } });
  assert.equal(env.navigations[0], '/packages/reports/index?id=firstreaction&recordId=record%3Fx%3D1%26x%3D2');
  assert.equal(env.navigations[1], '/pages/test-detail/index?id=mbti');
  assert.equal(env.requests.some(id => id.endsWith('/answer-drafts.js')), false);
});
