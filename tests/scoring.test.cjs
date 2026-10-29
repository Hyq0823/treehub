const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const catalog = require('../data/tests/index.js').default;
const { scoreTest, resolveReport } = require('../utils/scoring.js');
const get = id => catalog.find(item => item.id === id);
function result(id, choice) {
  const selected = get(id);
  const scored = scoreTest(selected, selected.questions, selected.questions.map(() => choice));
  return Object.assign({ testId: id, scoringVersion: '2' }, scored);
}

for (const selected of catalog) {
  test(`${selected.id}: both complete answer paths resolve a valid report`, () => {
    for (const choice of [0, 1]) {
      const scored = result(selected.id, choice);
      assert.ok(Object.values(scored.scores).every(Number.isFinite));
      if (selected.id !== 'ie') assert.ok(Object.values(scored.scores).some(value => value !== 0));
      const report = resolveReport(selected, scored);
      assert.ok(report && report.title);
    }
  });
}

test('MBTI and IE change with opposing answer patterns', () => {
  assert.equal(result('mbti', 0).resultType, 'ESTJ');
  assert.equal(result('mbti', 1).resultType, 'INFP');
  assert.deepEqual(result('mbti', 0).scores, { EI: 7, SN: 7, TF: 7, JP: 7 });
  assert.equal(result('ie', 0).scores.EI, 15);
  assert.equal(result('ie', 0).resultType, 'E');
  assert.equal(result('ie', 1).scores.EI, 0);
  assert.equal(result('ie', 1).resultType, 'I');
});

test('Enneagram assigns one vote per answer to its chosen type', () => {
  const selected = get('enneagram');
  const choices = selected.questions.map(question => question.options.findIndex(option => option.value === 1));
  const answers = choices.map(index => index >= 0 ? index : 0);
  const scored = scoreTest(selected, selected.questions, answers);
  assert.equal(Object.values(scored.scores).reduce((sum, value) => sum + value), selected.questions.length);
  assert.equal(scored.scores['1'], selected.questions.filter(question => question.options.some(option => option.value === 1)).length);
  const opposite = scoreTest(selected, selected.questions, selected.questions.map(() => 1));
  assert.notDeepEqual(opposite.scores, scored.scores);
});

test('Big Five reverse-coded items retain 1–5 range and reports all five dimensions', () => {
  const selected = get('bigfive');
  const low = result('bigfive', 0);
  assert.equal(low.scores.openness, 8);
  assert.equal(low.scores.neuroticism, 16); // Six 1s plus two reverse-keyed 5s.
  const answers = selected.questions.map(() => 0);
  answers[14] = 4;
  answers[34] = 4;
  const minimum = scoreTest(selected, selected.questions, answers);
  assert.equal(minimum.scores.neuroticism, 8);
  const report = resolveReport(selected, Object.assign({ testId: 'bigfive', scoringVersion: '2' }, minimum));
  assert.equal(report.dimensions.length, 5);
  assert.equal(report.dimensions.find(dim => dim.id === 'neuroticism').score, '1.00');
  assert.equal(report.dimensions.find(dim => dim.id === 'neuroticism').percent, 0);
  const middle = scoreTest(selected, selected.questions, selected.questions.map(() => 2));
  const neutralReport = resolveReport(selected, Object.assign({ testId: 'bigfive', scoringVersion: '2' }, middle));
  assert.ok(neutralReport.dimensions.every(dim => dim.level === '居中' && dim.percent === 50));
});

test('shuffled SBTI questions preserve scoring by canonical question ID', () => {
  const selected = get('sbti');
  const answers = selected.questions.map((question, index) => index % question.options.length);
  const normal = scoreTest(selected, selected.questions, answers);
  const shuffled = scoreTest(selected, selected.questions.slice().reverse(), answers.slice().reverse());
  assert.deepEqual(shuffled, normal);
});

test('unanswered or duplicate/missing question sets cannot produce a result', () => {
  const selected = get('mbti');
  assert.throws(() => scoreTest(selected, selected.questions, selected.questions.map(() => -1)), /所有题目/);
  const duplicate = selected.questions.slice();
  duplicate[0] = duplicate[1];
  assert.throws(() => scoreTest(selected, duplicate, selected.questions.map(() => 0)), /不一致/);
});

function loadPage(relative, archiveOverrides = {}) {
  const absolute = path.join(__dirname, '..', relative);
  const nativeRequire = createRequire(absolute);
  let page;
  const calls = { saved: [], redirect: [], switch: [], toast: [], modal: [] };
  const timers = new Map();
  let timerId = 0;
  const archive = Object.assign({
    saveResult: input => { calls.saved.push(input); return Object.assign({ id: 'record-1' }, input); },
    getRecord: () => null, getLatest: () => null
  }, archiveOverrides);
  const wx = {
    redirectTo: value => calls.redirect.push(value), switchTab: value => calls.switch.push(value),
    showToast: value => calls.toast.push(value), showModal: value => calls.modal.push(value)
  };
  vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), {
    Page: value => { page = value; }, wx, console,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    require: name => name.endsWith('/archive.js') ? archive : name.endsWith('/track.js') ? { report() {}, EVENTS: {} } : nativeRequire(name)
  }, { filename: absolute });
  page.setData = value => Object.assign(page.data, value);
  return { page, calls, timers };
}

test('answer page saves once, persists version metadata, redirects to exact record', () => {
  const { page, calls } = loadPage('pages/test-answer/index.js');
  page.onLoad({ id: 'ie' });
  page.data.answers = page.data.questions.map(() => 0);
  page.submitTest(); page.submitTest();
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.saved[0].scoringVersion, '2');
  assert.equal(calls.saved[0].answers[0].questionId, 1);
  assert.equal(calls.redirect[0].url, '/pages/test-result/index?id=ie&recordId=record-1');
  assert.equal(page.data.submitted, true);
});

test('storage failure preserves answers and allows retry without navigation', () => {
  const { page, calls } = loadPage('pages/test-answer/index.js', { saveResult: () => { throw new Error('storage full'); } });
  page.onLoad({ id: 'mbti' });
  page.data.answers = page.data.questions.map(() => 1);
  page.submitTest();
  assert.equal(page.data.submitted, false);
  assert.equal(page.data.submitting, false);
  assert.equal(calls.redirect.length, 0);
  assert.equal(calls.modal[0].content, 'storage full');
  assert.ok(page.data.answers.every(answer => answer === 1));
});

test('rapid selection replaces pending timer; revisiting preserves selection; unload clears timer', () => {
  const { page, timers } = loadPage('pages/test-answer/index.js');
  page.onLoad({ id: 'ie' });
  page.selectOption({ currentTarget: { dataset: { index: 0 } } });
  page.selectOption({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(timers.size, 1);
  page.nextQuestion();
  assert.equal(timers.size, 0);
  page.prevQuestion();
  assert.equal(page.data.selectedOption, 1);
  page.selectOption({ currentTarget: { dataset: { index: 0 } } });
  page.onUnload();
  assert.equal(timers.size, 0);
});

test('answer page rejects incomplete submission and focuses missing question', () => {
  const { page, calls } = loadPage('pages/test-answer/index.js');
  page.onLoad({ id: 'ie' });
  page.submitTest();
  assert.equal(calls.saved.length, 0);
  assert.equal(calls.redirect.length, 0);
  assert.equal(page.data.currentQuestionIndex, 0);
});

test('record-specific result does not display another local result or auto-redirect', () => {
  const wrong = Object.assign(result('ie', 0), { id: 'other', completedAt: Date.now() });
  const { page, calls } = loadPage('pages/test-result/index.js', { getRecord: () => wrong, getLatest: () => wrong });
  page.onLoad({ id: 'mbti', recordId: 'missing' });
  assert.equal(page.data.state, 'missing');
  assert.equal(calls.redirect.length, 0);
});

test('historical result resolves exact stored record and tab navigation', () => {
  const old = Object.assign(result('ie', 1), { id: 'old', completedAt: 1 });
  const newer = Object.assign(result('ie', 0), { id: 'new', completedAt: 2 });
  const { page, calls } = loadPage('pages/test-result/index.js', { getRecord: () => old, getLatest: () => newer });
  page.onLoad({ id: 'ie', recordId: 'old' });
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.result.title, 'i人');
  assert.equal(page.data.record.id, 'old');
  page.goToHome(); page.goToArchive();
  assert.deepEqual(calls.switch.map(item => item.url), ['/pages/test-hall/index', '/pages/user-center/index']);
});


test('legacy empty scores never expose broken default personality labels', () => {
  const defaults = { mbti: 'INFP', ie: 'E/I', shadow: 'high' };
  for (const [id, resultType] of Object.entries(defaults)) {
    const broken = { testId: id, resultType, scores: {}, scoringVersion: 'legacy' };
    assert.equal(resolveReport(get(id), broken), null);
    delete broken.scoringVersion;
    assert.equal(resolveReport(get(id), broken), null);
  }
  const validSbti = Object.assign(result('sbti', 0), { scoringVersion: 'legacy' });
  assert.ok(resolveReport(get('sbti'), validSbti).title);
});

test('migrated report labels original assessment time as unknown', () => {
  const record = Object.assign(result('sbti', 0), {
    id: 'legacy-1', completedAt: new Date().toISOString(), scoringVersion: 'legacy', migrated: true
  });
  const { page } = loadPage('pages/test-result/index.js', { getRecord: () => record });
  page.onLoad({ id: 'sbti', recordId: 'legacy-1' });
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.savedAt, '旧版导入 · 原测评时间未知');
  assert.equal(page.data.legacy, true);
});
