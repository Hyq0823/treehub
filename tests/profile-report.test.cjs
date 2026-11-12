const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { scoreTest, resolveReport } = require('../utils/scoring.js');
const { buildDeepReport, buildComparison } = require('../packages/reports/deep-report.js');
const catalog = require('../data/tests/index.js').default;
const ids = ['historicalecho', 'lifepath', 'hiddentalent'];

function scored(questionnaire, high = false) {
  const answers = questionnaire.questions.map(question => {
    const values = question.options.map(option => option.value);
    return values.indexOf(high ? Math.max(...values) : Math.min(...values));
  });
  return { testId: questionnaire.id, scoringVersion: '2', testVersion: '1',
    ...scoreTest(questionnaire, questionnaire.questions, answers) };
}

for (const id of ids) {
  test(`${id}: complete free dimensions and personalized deep actions use the same self-report positions`, () => {
    const questionnaire = catalog.find(item => item.id === id);
    assert.ok(questionnaire);
    for (const high of [false, true]) {
      const record = scored(questionnaire, high);
      const result = resolveReport(questionnaire, record);
      const deep = buildDeepReport(questionnaire, record, result);
      assert.equal(deep.mode, 'profile');
      assert.equal(deep.dimensions.length, questionnaire.scoring.dimensions.length);
      assert.deepEqual(deep.dimensions.map(item => item.percent), result.dimensions.map(item => item.percent));
      assert.ok(deep.dimensions.every(item => item.percent === (high ? 100 : 0)));
      assert.equal(deep.sections[0].content, result.description);
      assert.equal(deep.sections[1].content, result.strengths);
      assert.equal(deep.sections[2].content, result.watchout);
      assert.deepEqual(deep.actions, result.actions);
      assert.equal(deep.actions.length, 3);
      assert.ok(deep.tagline);
      assert.doesNotMatch(JSON.stringify(deep), /更准|匹配准确率|你的命运/);
    }
  });
}

test('profile comparison ignores damaged prior summary and keeps valid current report accessible', () => {
  const questionnaire = catalog.find(item => item.id === 'lifepath');
  const record = scored(questionnaire);
  const previous = { ...record, scores: { unknown: 999 } };
  assert.equal(buildComparison(questionnaire, record, previous), null);
  assert.ok(buildDeepReport(questionnaire, record, resolveReport(questionnaire, record)));
});

test('profile sharing invites a new test without exposing private record, score or life context in the route', () => {
  const filename = path.resolve(__dirname, '../packages/reports/index.js');
  const nativeRequire = createRequire(filename);
  let page;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { page = value; },
    require(id) { return id.endsWith('/track.js') ? { report() {}, EVENTS: {} } : nativeRequire(id); },
    console
  }, { filename });
  for (const id of ids) {
    const questionnaire = catalog.find(item => item.id === id);
    page.data = { test: { id, name: questionnaire.name }, result: { title: '我的测试结果' },
      rankingProfile: [], record: { id: 'private-id', lifeContext: 'breakup' } };
    const shared = page.onShareAppMessage();
    assert.equal(shared.path, `/pages/test-detail/index?id=${id}`);
    assert.match(shared.title, /古人|轨道|可能/);
    assert.doesNotMatch(shared.path, /private-id|breakup|scores|resultType/);
  }
});
