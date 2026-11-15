const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const drafts = require('../utils/answer-drafts.js');
const archive = require('../utils/archive.js');
const { scoreTest } = require('../utils/scoring.js');
const { getTest } = require('../data/test-loader.js');
let memory, writes, toasts, modals, navigations, failures;
beforeEach(() => {
  memory = new Map(); writes = []; toasts = []; modals = []; navigations = [];
  failures = { write: false, draftCleanup: false, read: false };
  global.wx = {
    getStorageSync(key) {
      if (failures.read && key === drafts.STORAGE_KEY) throw new Error('read failed');
      return memory.has(key) ? structuredClone(memory.get(key)) : '';
    },
    setStorageSync(key, value) {
      if (failures.write || failures.draftCleanup && key === drafts.STORAGE_KEY && value.drafts.length === 0) throw new Error('storage full');
      writes.push({ key, value: structuredClone(value) });
      memory.set(key, structuredClone(value));
    },
    removeStorageSync(key) { memory.delete(key); },
    showToast(value) { toasts.push(value); }, showModal(value) { modals.push(value); },
    navigateTo(value) { navigations.push(value); }, redirectTo(value) { navigations.push(value); },
    switchTab() {}, setNavigationBarTitle() {}
  };
});

function state(test, overrides = {}) {
  return Object.assign({
    sessionId: drafts.createSessionId(), questionOrder: test.questions.map(question => String(question.id)),
    answers: test.questions.map((question, index) => question.type === 'ranking' ? [1, 0] : index === 0 ? 1 : -1),
    currentQuestionIndex: 0, lifeContext: 'work'
  }, overrides);
}

function page(route, archiveOverrides = {}) {
  const absolute = path.resolve(__dirname, '..', route + '.js');
  const nativeRequire = createRequire(absolute);
  let value, timerId = 0;
  const timers = new Map(), updates = [];
  vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), {
    Page(definition) { value = definition; }, wx: global.wx, console,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id.endsWith('/archive.js')) return Object.assign({}, archive, archiveOverrides);
      if (id.endsWith('/themes.js')) return { getState: () => ({ selectedId: '', catalog: [] }) };
      if (id.endsWith('/public-assets.js')) return { resolvePublicAssets: async () => ({}) };
      return nativeRequire(id);
    }
  }, { filename: absolute });
  value.data = structuredClone(value.data);
  value.setData = patch => { updates.push(patch); Object.assign(value.data, patch); };
  function run(delay) {
    for (const [id, task] of [...timers]) {
      if (task.delay !== delay || !timers.has(id)) continue;
      timers.delete(id); task.callback();
    }
  }
  return { page: value, timers, updates, run };
}

test('version-scoped draft stores canonical order and local context without sharing references', () => {
  const quiz = getTest('mbti'), input = state(quiz);
  drafts.saveDraft(quiz, input);
  input.answers[0] = 0;
  const draft = drafts.getDraft(quiz);
  assert.equal(draft.answers[0], 1);
  assert.equal(draft.lifeContext, 'work');
  assert.equal(draft.answeredCount, 1);
  assert.equal(draft.scoringVersion, '2');
  assert.deepEqual(draft.questionOrder, quiz.questions.map(question => String(question.id)));
  draft.answers[0] = 0;
  assert.equal(drafts.getDraft(quiz).answers[0], 1);
  assert.equal(memory.size, 1);
});

test('lightweight entry check does not load a quiz and failed reads never block starting', () => {
  assert.equal(drafts.hasPendingDraft('mbti'), false);
  drafts.saveDraft(getTest('mbti'), state(getTest('mbti')));
  assert.equal(drafts.hasPendingDraft('mbti'), true);
  assert.equal(drafts.hasPendingDraft('firstreaction'), false);
  for (const id of ['../mbti', '__proto__', null, undefined]) assert.equal(drafts.hasPendingDraft(id), false);
  failures.read = true;
  assert.equal(drafts.hasPendingDraft('mbti'), false);
  failures.read = false;
  memory.get(drafts.STORAGE_KEY).drafts[0].updatedAt = new Date(Date.now() - drafts.MAX_AGE_MS - 1000).toISOString();
  assert.equal(drafts.hasPendingDraft('mbti'), false);
  assert.doesNotMatch(fs.readFileSync(require.resolve('../utils/answer-drafts.js'), 'utf8'), /require\(['"].*(?:test-loader|data\/tests)/);
});

test('incompatible, stale, completed or malformed choices never restore', () => {
  const quiz = getTest('mbti');
  drafts.saveDraft(quiz, state(quiz));
  const original = structuredClone(memory.get(drafts.STORAGE_KEY));
  const changes = [
    draft => { draft.testVersion = 'older'; },
    draft => { draft.scoringVersion = 'legacy'; },
    draft => { draft.questionSignature = 'changed'; },
    draft => { draft.status = 'completed'; },
    draft => { draft.sessionId = '../bad'; },
    draft => { draft.lifeContext = 'unknown'; },
    draft => { draft.answers[0] = 999; },
    draft => { draft.answers[0] = '1'; },
    draft => { draft.questionOrder[1] = draft.questionOrder[0]; },
    draft => { draft.questionOrder[0] = 'unknown'; },
    draft => { draft.currentQuestionIndex = -1; },
    draft => { draft.updatedAt = new Date(Date.now() - drafts.MAX_AGE_MS - 1000).toISOString(); },
    draft => { draft.updatedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); }
  ];
  for (const change of changes) {
    const modified = structuredClone(original); change(modified.drafts[0]);
    memory.set(drafts.STORAGE_KEY, modified);
    assert.equal(drafts.getDraft(quiz), null);
  }
  memory.set(drafts.STORAGE_KEY, original);
  assert.equal(drafts.getDraft({ ...quiz, testVersion: '2' }), null);
});

test('ranking drafts retain partial order and reject duplicate or out-of-range choices', () => {
  const quiz = getTest('firstreaction');
  drafts.saveDraft(quiz, state(quiz));
  assert.deepEqual(drafts.getDraft(quiz).answers[0], [1, 0]);
  assert.equal(drafts.getDraft(quiz).selectedCount, 2);
  assert.equal(drafts.getDraft(quiz).answeredCount, 0);
  for (const order of [[0, 0], [-1], [99], ['1']]) {
    const stored = memory.get(drafts.STORAGE_KEY);
    stored.drafts[0].answers[0] = order;
    assert.equal(drafts.getDraft(quiz), null);
  }
});

test('draft count and snapshot size are bounded as the catalog grows', () => {
  for (let index = 0; index < drafts.MAX_DRAFTS + 4; index++) {
    const quiz = { ...getTest('ie'), id: 'future-' + index };
    drafts.saveDraft(quiz, state(quiz));
  }
  const stored = memory.get(drafts.STORAGE_KEY);
  assert.equal(stored.drafts.length, drafts.MAX_DRAFTS);
  assert.ok(stored.drafts.every(draft => JSON.stringify(draft).length <= drafts.MAX_DRAFT_BYTES));
  assert.equal(stored.drafts.some(draft => draft.testId === 'future-0'), false);
  const quiz = getTest('ie');
  drafts.saveDraft(quiz, state(quiz));
  drafts.removeDraft(quiz.id, 'draft-other-session');
  assert.ok(drafts.getDraft(quiz), 'stale pages cannot clear a newer session');
});

test('rapid selections debounce disk writes and hiding flushes the current selection without auto-advancing', () => {
  const env = page('pages/test-answer/index'); env.page.onLoad({ id: 'mbti', context: 'work' });
  env.page.selectOption({ currentTarget: { dataset: { index: 0 } } });
  env.page.selectOption({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(writes.filter(write => write.key === drafts.STORAGE_KEY).length, 0);
  assert.equal([...env.timers.values()].filter(timer => timer.delay === 500).length, 1);
  env.page.onHide();
  assert.equal(env.timers.size, 0);
  assert.equal(drafts.getDraft(getTest('mbti')).answers[0], 1);
  assert.equal(env.page.data.currentQuestionIndex, 0);
  assert.equal(env.page.data.autoAdvancing, false);
  env.page.onUnload();
  assert.equal(writes.filter(write => write.key === drafts.STORAGE_KEY).length, 1);
  assert.ok(env.updates.every(update => !Object.hasOwn(update, 'answers') && !Object.hasOwn(update, 'questions')));
});

test('returning to a shuffled quiz restores the original question order, context and previous answers', () => {
  const first = page('pages/test-answer/index'); first.page.onLoad({ id: 'sbti', context: 'overthinking' });
  first.page.selectOption({ currentTarget: { dataset: { index: 2 } } });
  first.page.nextQuestion();
  first.page.selectOption({ currentTarget: { dataset: { index: 1 } } });
  first.page.onUnload();
  const order = first.page._questions.map(question => String(question.id));
  const resumed = page('pages/test-answer/index'); resumed.page.onLoad({ id: 'sbti', resume: '1', context: 'ordinary' });
  assert.deepEqual(Array.from(resumed.page._questions, question => String(question.id)), Array.from(order));
  assert.equal(resumed.page._lifeContext, 'overthinking');
  assert.equal(resumed.page.data.currentQuestionIndex, 1);
  assert.equal(resumed.page.data.selectedOption, 1);
  resumed.page.prevQuestion();
  assert.equal(resumed.page.data.selectedOption, 2);
  resumed.page.onUnload();
});

test('detail exposes a small progress summary, keeps ordinary selected and resumes only on an explicit tap', () => {
  const quiz = getTest('mbti'); drafts.saveDraft(quiz, state(quiz));
  const env = page('pages/test-detail/index'); env.page.onLoad({ id: 'mbti' });
  assert.equal(env.page.data.selectedContext, 'ordinary');
  assert.equal(env.page.data.draft.answeredCount, 1);
  assert.equal(env.page.data.draft.contextLabel, '工作变化');
  assert.equal('answers' in env.page.data.draft, false);
  assert.equal('sessionId' in env.page.data.draft, false);
  assert.equal(navigations.length, 0);
  env.page.resumeTest(); env.page.resumeTest();
  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].url, '/pages/test-answer/index?id=mbti&resume=1');
  navigations[0].complete();
  env.page.startTest();
  assert.equal(navigations[1].url, '/pages/test-answer/index?id=mbti&context=ordinary&restart=1');
  assert.doesNotMatch(env.page.onShareAppMessage().path, /resume|session|record|answers/);
});

test('starting over clears the previous draft and never carries its context or answers into a fresh test', () => {
  const quiz = getTest('mbti'); drafts.saveDraft(quiz, state(quiz));
  const env = page('pages/test-answer/index'); env.page.onLoad({ id: 'mbti', context: 'ordinary', restart: '1' });
  assert.equal(drafts.getDraft(quiz), null);
  assert.equal(env.page._lifeContext, 'ordinary');
  assert.ok(env.page._answers.every(answer => answer === -1));
  env.page.onUnload();
});

test('failed draft persistence keeps answers interactive and surfaces a recoverable warning', () => {
  const env = page('pages/test-answer/index'); env.page.onLoad({ id: 'mbti' });
  failures.write = true;
  env.page.selectOption({ currentTarget: { dataset: { index: 1 } } }); env.run(500);
  assert.equal(env.page._answers[0], 1);
  assert.equal(env.page.data.error, '');
  assert.match(env.page.data.draftWarning, /暂未保存/);
  assert.match(toasts[0].title, /存储空间/);
  failures.write = false;
  env.page.nextQuestion(); env.run(500);
  assert.equal(env.page.data.draftWarning, '');
  assert.equal(drafts.getDraft(getTest('mbti')).answers[0], 1);
  env.page.onUnload();
});

test('draft read failure does not prevent starting or answering the selected quiz', () => {
  failures.read = true;
  const env = page('pages/test-answer/index'); env.page.onLoad({ id: 'mbti', resume: '1' });
  assert.equal(env.page.data.error, '');
  assert.equal(env.page._questions.length, getTest('mbti').questions.length);
  assert.match(env.page.data.draftWarning, /暂未读出/);
  env.page.selectOption({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(env.page._answers[0], 1);
  env.page.onUnload();
});

test('fully answered unsaved ranking resumes for manual review and creates exactly one report on retry', () => {
  const first = page('pages/test-answer/index', { saveResult() { throw new Error('archive full'); } });
  first.page.onLoad({ id: 'firstreaction', context: 'work' });
  first.page._answers = [first.page._questions[0].options.map((_option, index) => index)];
  first.page.updateQuestion(); first.page.submitTest();
  assert.equal(first.page.data.submitted, false);
  assert.equal(drafts.getDraft(getTest('firstreaction')).allAnswered, true);
  first.page.onUnload();
  const resumed = page('pages/test-answer/index'); resumed.page.onLoad({ id: 'firstreaction', resume: '1' });
  assert.equal(resumed.page.data.rankingReadyToSubmit, true);
  assert.equal(resumed.page.data.rankingSaveError, '');
  assert.equal(resumed.page.data.submitted, false);
  assert.equal(resumed.timers.size, 0, 'resuming full choices must not auto-submit');
  resumed.page.retryRanking(); resumed.page.retryRanking();
  assert.equal(resumed.page.data.submitted, true);
  assert.equal(archive.getRecords('firstreaction').length, 1);
  assert.equal(drafts.getDraft(getTest('firstreaction')), null);
  resumed.page.onUnload();
});

test('partial ranking supports undo/reset after resume, and hiding a completed order offers manual generate', () => {
  const quiz = getTest('firstreaction'); drafts.saveDraft(quiz, state(quiz));
  const env = page('pages/test-answer/index'); env.page.onLoad({ id: quiz.id, resume: '1' });
  assert.deepEqual(Array.from(env.page._answers[0]), [1, 0]);
  env.page.undoRanking(); env.page.onHide();
  assert.deepEqual(drafts.getDraft(quiz).answers[0], [1]);
  env.page.onShow(); env.page.resetRanking(); env.page.onHide();
  assert.equal(drafts.getDraft(quiz), null);
  env.page.onShow();
  for (let index = 0; index < quiz.questions[0].options.length; index++) env.page.changeRanking({ detail: { index } });
  env.page.onHide(); env.page.onShow();
  assert.equal(env.page.data.rankingReadyToSubmit, true);
  assert.equal(env.page.data.submitted, false);
  env.page.retryRanking();
  assert.equal(env.page.data.submitted, true);
  env.page.onUnload();
});

test('successful report invalidates pending timers and stale draft cleanup failures cannot offer a duplicate session', () => {
  const env = page('pages/test-answer/index'); env.page.onLoad({ id: 'mbti', context: 'ordinary' });
  env.page.selectOption({ currentTarget: { dataset: { index: 0 } } });
  const staleFlush = [...env.timers.values()].find(task => task.delay === 500).callback;
  env.page._answers = env.page._questions.map(() => 0);
  failures.draftCleanup = true;
  env.page.submitTest();
  assert.equal(env.page.data.submitted, true);
  assert.ok(drafts.getDraft(getTest('mbti')), 'cleanup failure leaves a raw but obsolete draft');
  const records = archive.getRecords('mbti');
  assert.equal(drafts.getDraft(getTest('mbti'), records), null);
  staleFlush(); env.page.onUnload();
  const intro = page('pages/test-detail/index'); intro.page.onLoad({ id: 'mbti' });
  assert.equal(intro.page.data.draft, null);
  assert.equal(archive.getRecords('mbti').length, 1);
  assert.equal([...env.timers.values()].filter(task => task.delay === 500).length, 0);
});

test('saving then hiding pauses the reveal, and foreground resumes exactly one navigation without another save', () => {
  const env = page('pages/test-answer/index'); env.page.onLoad({ id: 'ie', context: 'ordinary' });
  env.page._answers = env.page._questions.map(() => 0);
  env.page.submitTest();
  const delayed = [...env.timers.values()][0].callback;
  env.page.onHide(); delayed();
  assert.equal(navigations.length, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(archive.getRecords('ie').length, 1);
  env.page.onShow();
  assert.equal(env.timers.size, 1);
  const active = [...env.timers.values()][0].callback;
  active(); active(); env.page.onShow();
  assert.equal(navigations.length, 1);
  assert.match(navigations[0].url, /^\/packages\/reports\/index\?id=ie&recordId=/);
  assert.equal(archive.getRecords('ie').length, 1);
  env.page.onUnload();
});

test('unloaded reveal callbacks and hidden late navigation failures cannot navigate or open a native modal', () => {
  const unloaded = page('pages/test-answer/index'); unloaded.page.onLoad({ id: 'ie' });
  unloaded.page._answers = unloaded.page._questions.map(() => 0); unloaded.page.submitTest();
  const late = [...unloaded.timers.values()][0].callback;
  unloaded.page.onUnload(); late();
  assert.equal(navigations.length, 0);
  assert.equal(modals.length, 0);

  const hidden = page('pages/test-answer/index'); hidden.page.onLoad({ id: 'ie' });
  hidden.page._answers = hidden.page._questions.map(() => 1); hidden.page.submitTest();
  [...hidden.timers.values()][0].callback();
  assert.equal(navigations.length, 1);
  hidden.page.onHide(); navigations[0].fail();
  assert.equal(modals.length, 0);
  hidden.page.onShow();
  [...hidden.timers.values()].at(-1).callback();
  assert.equal(navigations.length, 2, 'foreground may retry opening the already saved record');
  assert.equal(navigations[0].url, navigations[1].url);
  assert.equal(archive.getRecords('ie').length, 2, 'only the two explicitly submitted sessions were saved');
  hidden.page.onUnload(); navigations[1].fail();
  assert.equal(modals.length, 0);
});

test('archive session receipts are local only, validate their shape and make repeated saves idempotent', () => {
  const quiz = getTest('ie'), answers = quiz.questions.map(() => 0);
  const input = {
    testId: quiz.id, testVersion: '1', scoringVersion: '2', answerSessionId: drafts.createSessionId(),
    answers: quiz.questions.map((question, index) => ({ questionId: question.id, optionIndex: answers[index] })),
    ...scoreTest(quiz, quiz.questions, answers)
  };
  const first = archive.saveResult(input), second = archive.saveResult(input);
  assert.equal(first.id, second.id);
  assert.equal(archive.getRecords('ie').length, 1);
  const summary = require('../utils/cloud-sync.js').summaryRecord(first);
  assert.equal('answerSessionId' in summary, false);
  assert.equal('answers' in summary, false);
  for (const session of ['', '../bad', 'draft-a-' + 'b'.repeat(100), 5]) {
    assert.throws(() => archive.saveResult({ ...input, answerSessionId: session }), /作答标记/);
  }
  assert.throws(() => archive.saveResult({ ...input, testVersion: '2' }), /不一致/);
  drafts.saveDraft(quiz, state(quiz));
  archive.clearLocalArchive();
  assert.equal(memory.has(drafts.STORAGE_KEY), false);
  assert.equal(memory.has(archive.STORAGE_KEY), false);
});
