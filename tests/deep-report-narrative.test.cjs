const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../data/tests/index.js').default;
const { scoreTest, resolveReport } = require('../utils/scoring.js');
const { buildDeepReport } = require('../packages/reports/deep-report.js');
const questionnaire = catalog.find(item => item.id === 'bigfive');

function fromScores(scores) {
  const defaults = Object.fromEntries(questionnaire.scoring.dimensions.map(id => [id, 24]));
  const record = { testId: 'bigfive', scoringVersion: '2', resultType: 'profile', scores: { ...defaults, ...scores } };
  return buildDeepReport(questionnaire, record, resolveReport(questionnaire, record));
}

function fromChoice(choice) {
  const record = {
    testId: 'bigfive', scoringVersion: '2',
    ...scoreTest(questionnaire, questionnaire.questions, questionnaire.questions.map(() => choice))
  };
  return buildDeepReport(questionnaire, record, resolveReport(questionnaire, record));
}

function section(report, title) { return report.sections.find(item => item.title === title).content; }

test('all-middle answers produce a balanced narrative without an arbitrary strongest dimension', () => {
  const report = fromChoice(2);
  assert.ok(report.dimensions.every(item => item.percent === 50));
  assert.match(section(report, '画像主线'), /都位于量表中点/);
  assert.doesNotMatch(section(report, '画像主线'), /开放性|尽责性|最明显|最能区分/);
  assert.equal(report.actions.length, 3);
  assert.match(section(report, '关系中的你'), /接近中间/);
});

test('opposing complete answers produce different direction-specific deep interpretations', () => {
  const low = fromChoice(0);
  const high = fromChoice(4);
  assert.notDeepEqual(low.sections, high.sections);
  assert.match(section(low, '画像主线'), /开放性更靠近「偏好熟悉」/);
  assert.match(section(high, '画像主线'), /开放性更靠近「探索新知」/);
  assert.doesNotMatch(section(low, '优势如何发挥'), /探索新知或偏好熟悉/);
  assert.notEqual(section(low, '关系中的你'), section(high, '关系中的你'));
});

test('all equally salient dimensions are included rather than picking the first two', () => {
  const report = fromScores({ openness: 40, conscientiousness: 8, extraversion: 40, agreeableness: 8, neuroticism: 40 });
  const main = section(report, '画像主线');
  assert.match(main, /并列/);
  for (const dimension of report.dimensions) assert.ok(main.includes(dimension.label), dimension.label);
  assert.match(main, /尽责性更靠近「灵活随性」/);
  assert.match(main, /情绪敏感性更靠近「感受敏锐」/);
});

test('one salient dimension is described alone and its opposite gets different guidance', () => {
  const high = fromScores({ openness: 40 });
  const low = fromScores({ openness: 8 });
  assert.match(section(high, '画像主线'), /开放性更靠近「探索新知」/);
  assert.doesNotMatch(section(high, '画像主线'), /尽责性|并列/);
  assert.match(section(low, '画像主线'), /开放性更靠近「偏好熟悉」/);
  assert.notEqual(high.actions[0], low.actions[0]);
});

test('near-middle positions do not get exaggerated into a salient personality claim', () => {
  const report = fromScores({ openness: 25, conscientiousness: 23, extraversion: 26, agreeableness: 22 });
  assert.match(section(report, '画像主线'), /都接近量表中间区间/);
  assert.doesNotMatch(section(report, '画像主线'), /最明显|并列|更靠近/);
});

test('emotional-sensitivity direction changes strengths and cautions without a quality ranking', () => {
  const sensitive = fromScores({ neuroticism: 40 });
  const steady = fromScores({ neuroticism: 8 });
  assert.match(section(sensitive, '画像主线'), /情绪敏感性更靠近「感受敏锐」/);
  assert.match(section(steady, '画像主线'), /情绪敏感性更靠近「情绪平稳」/);
  assert.match(section(sensitive, '平衡与盲区'), /已.*发生|预想/);
  assert.match(section(steady, '平衡与盲区'), /并不等于没有压力/);
  assert.notEqual(sensitive.actions[0], steady.actions[0]);
  for (const report of [sensitive, steady]) {
    assert.equal(report.dimensions.length, 5);
    assert.equal(report.actions.length, 3);
    assert.match(section(report, '画像主线'), /没有高低优劣/);
  }
});
