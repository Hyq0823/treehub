const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const drafts = require('../utils/answer-drafts.js');
const { getTest } = require('../data/test-loader.js');
const { scoreTest } = require('../utils/scoring.js');
const { catalog } = require('../data/test-catalog.js');
const { INTENTS, buildExplorationGuide } = require('../utils/exploration-guide.js');
let memory, draftReads, storageWrites;
beforeEach(() => {
  memory = new Map(); draftReads = 0; storageWrites = 0;
  global.wx = {
    getStorageSync(key) { if (key === drafts.STORAGE_KEY) draftReads++; return memory.has(key) ? structuredClone(memory.get(key)) : ''; },
    setStorageSync(key, value) { storageWrites++; memory.set(key, structuredClone(value)); }
  };
});
function save(testId, overrides = {}) {
  const quiz = getTest(testId);
  return drafts.saveDraft(quiz, {
    sessionId: drafts.createSessionId(), questionOrder: quiz.questions.map(question => String(question.id)),
    answers: quiz.questions.map((question, index) => question.type === 'ranking' ? [1, 3] : index < 3 ? 0 : -1),
    currentQuestionIndex: Math.min(3, quiz.questions.length - 1), lifeContext: 'breakup', ...overrides
  });
}
const mutate = callback => {
  const store = structuredClone(memory.get(drafts.STORAGE_KEY));
  callback(store.drafts[0]); memory.set(drafts.STORAGE_KEY, store);
};
function completedRecord(testId, index = 0) {
  const quiz = getTest(testId);
  const answers = quiz.questions.map(question => question.type === 'ranking' ? question.options.map((_, option) => option) : 0);
  return { id: `record-${index}-${testId}`, testId, testVersion: quiz.testVersion || '1', scoringVersion: '2',
    completedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(), ...scoreTest(quiz, quiz.questions, answers) };
}

test('generated resume metadata exactly follows all questionnaire versions, signatures and option shapes', () => {
  const imported = require('../data/tests/index.js');
  const quizzes = imported.default || imported;
  const manifest = require('../data/draft-manifest.js');
  const { manifestContents, checkManifest } = require('../scripts/update-draft-manifest.cjs');
  assert.equal(checkManifest(), true);
  assert.equal(fs.readFileSync(path.join(root, 'data/draft-manifest.js'), 'utf8'), manifestContents(quizzes));
  assert.deepEqual(Object.keys(manifest).sort(), catalog.map(item => item.id).sort());
  for (const quiz of quizzes) {
    const saved = save(quiz.id);
    const metadata = manifest[quiz.id];
    assert.equal(metadata.testVersion, String(quiz.testVersion || '1'));
    assert.equal(metadata.questionSignature, saved.questionSignature);
    assert.deepEqual(metadata.questions, quiz.questions.map(question => [String(question.id), question.options.length, question.type === 'ranking' ? 1 : 0]));
  }
  const source = fs.readFileSync(path.join(root, 'data/draft-manifest.js'), 'utf8');
  assert.doesNotMatch(source, /description|reports|optionIndex|lifeContext|require\(/);
  const result = spawnSync(process.execPath, ['scripts/update-draft-manifest.cjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('latest-draft summary reads one key and exposes only progress, never original answers or private context', () => {
  const saved = save('mbti');
  draftReads = 0; const writes = storageWrites;
  const summary = drafts.getLatestDraftSummary([]);
  assert.equal(draftReads, 1);
  assert.equal(storageWrites, writes);
  assert.equal(summary.testId, 'mbti');
  assert.equal(summary.answeredCount, 3);
  assert.equal(summary.totalCount, 28);
  assert.equal(summary.allAnswered, false);
  for (const key of ['answers', 'questionOrder', 'lifeContext', 'sessionId', 'questionSignature']) assert.equal(key in summary, false);
  const records = Array.from({ length: 4000 }, (_, index) => ({ answerSessionId: `draft-old-${index.toString(36)}` }));
  records.push({ answerSessionId: saved.sessionId });
  assert.equal(drafts.getLatestDraftSummary(records), null, 'a stored report suppresses stale cleanup leftovers');
});

test('invalid, replaced-version, expired and empty drafts do not become a hall resume invitation', () => {
  const saved = save('historicalecho');
  const base = structuredClone(memory.get(drafts.STORAGE_KEY));
  const mutations = [
    item => { item.testVersion = '1'; },
    item => { item.scoringVersion = 'legacy'; },
    item => { item.questionSignature = 'old-signature'; },
    item => { item.testId = 'unknown'; },
    item => { item.questionOrder[1] = item.questionOrder[0]; },
    item => { item.questionOrder[0] = 'unknown'; },
    item => { item.answers[0] = 999; },
    item => { item.answers = item.answers.map(() => -1); },
    item => { item.currentQuestionIndex = -1; },
    item => { item.updatedAt = new Date(Date.now() - drafts.MAX_AGE_MS - 1000).toISOString(); },
    item => { item.updatedAt = new Date(Date.now() + 600000).toISOString(); },
    item => { item.lifeContext = 'invented'; },
    item => { item.status = 'completed'; },
    item => { item.sessionId = 'invalid'; }
  ];
  for (const change of mutations) {
    memory.set(drafts.STORAGE_KEY, structuredClone(base)); mutate(change);
    assert.equal(drafts.getLatestDraftSummary(), null, change.toString());
  }
  memory.set(drafts.STORAGE_KEY, base);
  assert.equal(drafts.getLatestDraftSummary().testId, saved.testId);
  global.wx.getStorageSync = () => { throw new Error('storage unavailable'); };
  assert.equal(drafts.getLatestDraftSummary(), null);
});

test('valid newer drafts take priority while completed sessions and broken ranking choices are skipped', () => {
  save('mbti');
  mutate(item => { item.updatedAt = new Date(Date.now() - 30000).toISOString(); });
  const ranking = save('firstreaction');
  const summary = drafts.getLatestDraftSummary();
  assert.equal(summary.testId, 'firstreaction');
  assert.equal(summary.ranking, true);
  assert.equal(summary.selectedCount, 2);
  assert.equal(summary.answeredCount, 0);
  assert.equal(summary.progressPercent, 40, 'partial ranking progress counts chosen positions instead of completed scenes');
  assert.equal(buildExplorationGuide([], summary).progressPercent, 40);
  assert.equal(drafts.getLatestDraftSummary([{ answerSessionId: ranking.sessionId }]).testId, 'mbti');
  mutate(item => { item.answers[0] = [1, 1]; });
  assert.equal(drafts.getLatestDraftSummary().testId, 'mbti');
  const quiz = getTest('mbti');
  save('mbti', { answers: quiz.questions.map(() => 0), currentQuestionIndex: 27 });
  assert.equal(drafts.getLatestDraftSummary().allAnswered, true, 'fully answered but unsaved sessions remain resumable');
});

test('intent choices recommend an unexplored related test; complete directions invite a real revisit', () => {
  assert.equal(INTENTS.length, 4);
  assert.equal(buildExplorationGuide([], null).testId, 'firstreaction');
  assert.equal(buildExplorationGuide([], null, 'relationship').testId, 'friendshipstyle');
  assert.equal(buildExplorationGuide([], null, 'emotion').testId, 'emotionalrecharge');
  assert.equal(buildExplorationGuide([], null, 'direction').testId, 'lifepath');
  const complete = catalog.map((quiz, index) => completedRecord(quiz.id, index));
  for (const intent of INTENTS) {
    const guide = buildExplorationGuide(complete, null, intent.id);
    assert.equal(guide.mode, 'revisit');
    assert.ok(guide.testId && guide.buttonLabel.includes('重新'));
    assert.doesNotMatch(JSON.stringify(guide), /还差|完成率|准确率|recordId|scores|answers/);
    assert.deepEqual(buildExplorationGuide(complete, null, intent.id), guide, 'unrelated rerenders do not shuffle recommendations');
  }
  const old = { testId: 'friendshipstyle', scoringVersion: 'legacy', completedAt: '2026-01-01' };
  assert.equal(buildExplorationGuide([old], null, 'relationship').mode, 'discover');
  assert.deepEqual(buildExplorationGuide([], null, '__proto__'), buildExplorationGuide([], null));
  const pending = { testId: 'mbti', answeredCount: 3, totalCount: 28, allAnswered: false };
  assert.equal(buildExplorationGuide(complete, pending, 'relationship').mode, 'resume');
});

test('broken history cannot masquerade as a completed discovery or replace the intended new test', () => {
  const valid = completedRecord('friendshipstyle');
  for (const patch of [
    { scores: {} }, { scores: { scene: 99 } }, { resultType: 'made-up-type' },
    { migrated: true }, { scoringVersion: 'legacy' }, { completedAt: 'not-a-date' }, { id: '' }
  ]) {
    const guide = buildExplorationGuide([{ ...valid, ...patch }], null, 'relationship');
    assert.equal(guide.mode, 'discover');
    assert.equal(guide.testId, 'friendshipstyle');
  }
  assert.equal(buildExplorationGuide([valid], null, 'relationship').testId, 'relationshiprhythm');
});

test('quick-entry draft checks use the same version manifest and completed receipts as the hall summary', () => {
  const mbti = save('mbti');
  const ranking = save('firstreaction');
  assert.equal(drafts.hasPendingDraft('mbti'), true, 'a more recent different draft cannot mask this valid entry');
  assert.equal(drafts.hasPendingDraft('firstreaction', [{ answerSessionId: ranking.sessionId }]), false);
  mutate(item => { item.questionSignature = 'old-questionnaire'; });
  assert.equal(drafts.hasPendingDraft('firstreaction'), false);
  assert.equal(drafts.getLatestDraftSummary().testId, mbti.testId);
  assert.equal(drafts.hasPendingDraft('mbti', [{ answerSessionId: mbti.sessionId }]), false);
});

function hall(records = []) {
  const file = path.join(root, 'pages/test-hall/index.js'), nativeRequire = createRequire(file);
  let page, archiveReads = 0;
  const requests = [], navigation = [], toasts = [], updates = [];
  const wx = Object.assign({}, global.wx, {
    navigateTo(value) { navigation.push(value); }, showToast(value) { toasts.push(value); }
  });
  global.wx = wx;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, wx, console, setTimeout, clearTimeout,
    require(id) {
      requests.push(id);
      assert.equal(id.includes('test-loader'), false, 'hall never loads a full questionnaire');
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id.endsWith('/archive.js')) return { getArchive() { archiveReads++; return { seed: 'guide', records }; } };
      if (id === '../../utils/themes.js') return { getState(input) { assert.equal(input, records); return { selectedId: 'adventurer' }; } };
      if (id.endsWith('/theme-assets.js')) return { resolveThemeAsset: async () => '' };
      if (id.endsWith('/tab-bar.js')) return { syncTabBar() {} };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = data => { updates.push(data); Object.assign(page.data, data); };
  return { page, requests, navigation, toasts, updates, archiveReads: () => archiveReads };
}

test('hall reuses one archive and draft read, intent switches do no storage or questionnaire work', () => {
  save('mbti'); draftReads = 0;
  const env = hall(); env.page.onShow();
  assert.equal(env.archiveReads(), 1);
  assert.equal(draftReads, 1);
  assert.equal(env.page.data.explorationGuide.mode, 'resume');
  const payload = JSON.stringify(env.page.data.explorationGuide);
  assert.doesNotMatch(payload, /answers|questionOrder|sessionId|breakup|lifeContext/);
  for (const intent of INTENTS) env.page.selectGuideIntent({ currentTarget: { dataset: { id: intent.id } } });
  assert.equal(draftReads, 1);
  assert.equal(env.archiveReads(), 1);
  env.page.openExplorationGuide();
  assert.equal(env.navigation[0].url, '/pages/test-detail/index?id=mbti');
  assert.doesNotMatch(env.navigation[0].url, /resume|context|recordId/);
  env.page.onUnload();
});

test('all-collected hall keeps the old null recommendation and still offers an explicit ordinary retest', () => {
  const records = catalog.map((quiz, index) => completedRecord(quiz.id, index));
  const env = hall(records); env.page.onShow();
  assert.equal(env.page.data.recommendation, null);
  assert.equal(env.page.data.explorationGuide.mode, 'revisit');
  assert.ok(env.page.data.cards.every(card => card.collected));
  env.page.exploreNext();
  assert.equal(env.navigation[0].url, '/pages/test-detail/index?id=firstreaction');
  env.page.onUnload();
});

test('guide and recent-history navigation coalesce taps, expose failure recovery and ignore stale page callbacks', () => {
  const env = hall(); env.page.onShow();
  env.page.openExplorationGuide(); env.page.openExplorationGuide(); env.page.openTest({ currentTarget: { dataset: { id: 'mbti' } } });
  assert.equal(env.navigation.length, 1);
  env.navigation[0].fail();
  assert.equal(env.toasts.length, 1);
  env.page.openExplorationGuide();
  assert.equal(env.navigation.length, 2);
  env.page.onHide(); env.page.onShow();
  env.page.openExplorationGuide();
  assert.equal(env.navigation.length, 3);
  env.navigation[1].fail();
  env.page.openExplorationGuide();
  assert.equal(env.navigation.length, 3, 'old navigation cannot release the new navigation lock');
  env.page.onHide();
  env.navigation[2].fail();
  assert.equal(env.toasts.length, 1);
  env.page.onUnload();
});
