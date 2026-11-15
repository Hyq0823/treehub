const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { getTest } = require('../data/test-loader.js');
const { scoreTest, resolveReport } = require('../utils/scoring.js');
const { buildDeepReport } = require('../packages/reports/deep-report.js');
const archive = require('../utils/archive.js');
const drafts = require('../utils/answer-drafts.js');
const { recommendTests } = require('../utils/test-recommendations.js');
const quiz = getTest('friendshipstyle');
const root = path.resolve(__dirname, '..');
let memory, navigation, cardCaptures, ads, timerSequence;
beforeEach(() => {
  memory = new Map(); navigation = []; cardCaptures = []; ads = []; timerSequence = 0;
  for (const id of ['../packages/reports/premium-access.js', '../packages/reports/rewarded-video.js']) delete require.cache[require.resolve(id)];
  global.getApp = () => ({ globalData: {} });
  global.wx = {
    getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, structuredClone(value)),
    removeStorageSync: key => memory.delete(key),
    navigateTo: value => navigation.push(value.url), redirectTo: value => navigation.push(value.url),
    showToast() {}, showModal() {}, setNavigationBarTitle() {},
    createRewardedVideoAd() {
      const events = { load: new Set(), error: new Set(), close: new Set() };
      const ad = {
        show: async () => {}, load: async () => {},
        onLoad: fn => events.load.add(fn), offLoad: fn => events.load.delete(fn),
        onError: fn => events.error.add(fn), offError: fn => events.error.delete(fn),
        onClose: fn => events.close.add(fn), offClose: fn => events.close.delete(fn),
        close(result) { for (const callback of [...events.close]) callback(result); },
        destroy() { throw new Error('native ads must not be destroyed by a page'); }
      };
      ads.push(ad); return ad;
    }
  };
});

function page(route) {
  const absolute = path.join(root, route + '.js'), nativeRequire = createRequire(absolute);
  const timers = new Map();
  let value;
  vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), {
    Page(definition) { value = definition; }, wx: global.wx, getApp: global.getApp, console,
    setTimeout(callback, delay) { const id = ++timerSequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id === '../../utils/themes.js') return { getState: () => ({ starterClaimed: true, selectedId: '', catalog: [] }) };
      if (id === './result-share-card.js') return { async buildResultShareCard(_page, snapshot) {
        cardCaptures.push(snapshot); return { path: `/tmp/friendship-${snapshot.format}.jpg`, artFallback: false };
      } };
      return nativeRequire(id);
    }
  }, { filename: absolute });
  value.data = structuredClone(value.data);
  value.setData = patch => Object.assign(value.data, patch);
  return { page: value, timers };
}

function answersFor(vector) {
  const selections = new Map();
  quiz.scoring.dimensions.forEach(dim => {
    const questions = quiz.questions.filter(q => q.dim === dim);
    let remaining = questions.length + Math.round(questions.length * 3 * vector[dim] / 100);
    questions.forEach((q, index) => {
      const amount = Math.min(4, remaining - (questions.length - index - 1));
      selections.set(q.id, q.options.findIndex(option => option.value === amount));
      remaining -= amount;
    });
  });
  return quiz.questions.map(q => selections.get(q.id));
}

function save(vector = quiz.scoring.profiles[0].vector) {
  return archive.saveResult({ testId: quiz.id, testVersion: quiz.testVersion,
    ...scoreTest(quiz, quiz.questions, answersFor(vector)) });
}

test('five friendship identities are reachable from balanced everyday choices with all four free dimensions', () => {
  assert.equal(quiz.questions.length, 12);
  assert.equal(quiz.scoring.profiles.length, 5);
  for (const dim of quiz.scoring.dimensions) assert.equal(quiz.questions.filter(q => q.dim === dim).length, 3);
  assert.ok(quiz.questions.every(q => q.options.length === 4 && [...q.options.map(o => o.value)].sort().join() === '1,2,3,4'));
  const titles = new Set(), actions = new Set();
  for (const prototype of quiz.scoring.profiles) {
    const scored = scoreTest(quiz, quiz.questions, answersFor(prototype.vector));
    assert.equal(scored.resultType, prototype.type);
    const record = { testId: quiz.id, testVersion: '1', scoringVersion: '2', ...scored };
    const base = resolveReport(quiz, record), deep = buildDeepReport(quiz, record, base);
    assert.equal(base.dimensions.length, 4);
    assert.ok(base.dimensions.every(d => d.percent >= 0 && d.percent <= 100));
    assert.equal(base.image, undefined); assert.equal(base.assetPath, undefined);
    assert.equal(deep.sections.length, 4); assert.equal(deep.actions.length, 3);
    assert.match(deep.sections[0].title, /友情/);
    titles.add(base.title); actions.add(deep.actions.join('|'));
    assert.doesNotMatch(JSON.stringify({ title: base.title, tagline: base.tagline, description: base.description }), /依恋类型|友情等级|受欢迎指数|人群排名|命中率|准确率/);
  }
  assert.equal(titles.size, 5); assert.equal(actions.size, 5, 'each identity has its own practical suggestions');
  assert.match(quiz.note, /不评判友情质量/);
});

test('friendship draft resumes through the shared answer/detail flow and successful saving removes its pending state', () => {
  const first = page('pages/test-answer/index');
  first.page.onLoad({ id: quiz.id, context: 'work' });
  first.page.selectOption({ currentTarget: { dataset: { index: 2 } } });
  first.page.onHide(); first.page.onUnload();
  assert.equal(drafts.getDraft(quiz).answeredCount, 1);
  assert.equal(archive.getRecords(quiz.id).length, 0);
  const detail = page('pages/test-detail/index'); detail.page.onLoad({ id: quiz.id });
  assert.equal(detail.page.data.selectedContext, 'ordinary');
  assert.equal(detail.page.data.draft.answeredCount, 1);
  detail.page.resumeTest();
  assert.equal(navigation.at(-1), '/pages/test-answer/index?id=friendshipstyle&resume=1');
  const resumed = page('pages/test-answer/index'); resumed.page.onLoad({ id: quiz.id, resume: '1' });
  assert.equal(resumed.page._answers[0], 2); assert.equal(resumed.page._lifeContext, 'work');
  resumed.page._answers = answersFor(quiz.scoring.profiles[1].vector);
  resumed.page.submitTest();
  assert.equal(resumed.page.data.submitted, true);
  const saved = archive.getLatest(quiz.id);
  assert.equal(saved.answers.length, 12);
  assert.equal(saved.resultType, 'roaming');
  assert.equal(saved.lifeContext, 'work');
  assert.equal(drafts.getDraft(quiz, archive.getRecords()), null);
  assert.equal(drafts.hasPendingDraft(quiz.id), false);
  const report = page('packages/reports/index'); report.page.onLoad({ id: quiz.id, recordId: saved.id });
  assert.equal(report.page.data.state, 'ready'); assert.equal(report.page.data.profileDimensions.length, 4);
  assert.equal(report.page.data.premiumUnlocked, false);
  resumed.page.onUnload(); detail.page.onUnload(); report.page.onUnload();
});

test('friendship uses generic two-format sharing and strict per-record completed-video access', async () => {
  const first = save(), second = save(quiz.scoring.profiles[4].vector);
  const opened = page('packages/reports/index');
  opened.page.onLoad({ id: quiz.id, recordId: first.id });
  assert.equal(opened.page.data.state, 'ready');
  assert.equal(opened.page.data.profileDimensions.length, 4);
  assert.equal(opened.page.data.premiumUnlocked, false);
  assert.equal(cardCaptures.length, 0, 'opening a new test still does no personal Canvas work');
  await opened.page.prepareResultShareCard();
  await opened.page.prepareResultShareCard({ currentTarget: { dataset: { format: 'portrait' } } });
  assert.deepEqual(cardCaptures.map(c => c.format), ['chat', 'portrait']);
  for (const capture of cardCaptures) {
    assert.equal(capture.testId, quiz.id); assert.equal(capture.dimensions.length, 4);
    assert.equal(capture.mode, 'profile');
    assert.equal('answers' in capture, false); assert.equal('lifeContext' in capture, false);
    assert.equal('answerSessionId' in capture, false); assert.equal('deepReport' in capture, false);
  }
  const share = opened.page.onShareAppMessage();
  assert.equal(share.imageUrl, '/tmp/friendship-chat.jpg');
  assert.equal(share.path, '/pages/test-detail/index?id=friendshipstyle');
  assert.doesNotMatch(share.path, /recordId|answers|scores|context|Session/);
  await opened.page.showPremiumAd(); ads[0].close({ isEnded: false });
  assert.equal(opened.page.data.premiumUnlocked, false);
  assert.equal(archive.getRecord(first.id).premiumUnlockedAt, undefined);
  await opened.page.showPremiumAd(); ads[0].close({ isEnded: true });
  assert.equal(opened.page.data.premiumUnlocked, true);
  assert.ok(archive.getRecord(first.id).premiumUnlockedAt);
  assert.equal(archive.getRecord(second.id).premiumUnlockedAt, undefined, 'a later friendship record keeps separate rights');
  opened.page.onUnload();
});

test('a friendship exploration is discoverable after the intimacy quiz and leads to related self-care without loading full catalogs', () => {
  assert.deepEqual(recommendTests('relationshiprhythm', []).map(item => item.id), ['friendshipstyle', 'gentleboundaries']);
  assert.deepEqual(recommendTests('friendshipstyle', []).map(item => item.id), ['gentleboundaries', 'emotionalrecharge']);
  const completed = [{ testId: 'gentleboundaries', scoringVersion: '2', migrated: false }];
  assert.equal(recommendTests('friendshipstyle', completed)[0].id, 'emotionalrecharge');
  const source = fs.readFileSync(path.join(root, 'utils/test-recommendations.js'), 'utf8');
  assert.doesNotMatch(source, /data\/tests\/index|test-loader/);
});
