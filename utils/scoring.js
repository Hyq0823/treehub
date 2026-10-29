// Version 2: match numeric/q-prefixed question IDs and keep each test's score semantics.
const SCORING_VERSION = '2';
const TEST_VERSION = '1';
const BIG_FIVE = [
  ['openness', '开放性'], ['conscientiousness', '尽责性'],
  ['extraversion', '外向性'], ['agreeableness', '宜人性'], ['neuroticism', '情绪敏感性']
];

function questionKey(id) { return String(id).replace(/^q/, ''); }
function scoreTest(test, questions, answers) {
  if (!test || !test.scoring || !Array.isArray(questions) || !Array.isArray(answers) ||
      questions.length !== test.questions.length || answers.length !== questions.length) {
    throw new Error('测试数据不完整，请重新进入测试');
  }
  const byId = {};
  questions.forEach((question, index) => {
    const answer = answers[index];
    if (!Number.isInteger(answer) || answer < 0 || !question.options[answer]) {
      throw new Error('请完成所有题目后再查看报告');
    }
    byId[questionKey(question.id)] = { question, option: question.options[answer] };
  });
  if (Object.keys(byId).length !== test.questions.length ||
      test.questions.some(question => !byId[questionKey(question.id)])) {
    throw new Error('题目数据不一致，请重新进入测试');
  }
  const scores = {};
  test.scoring.dimensions.forEach(dim => { scores[dim] = 0; });
  if (test.id === 'enneagram') {
    // Option values identify a type, not a weight applied to both competing types.
    questions.forEach((question, index) => {
      const dim = String(question.options[answers[index]].value);
      if (!Object.prototype.hasOwnProperty.call(scores, dim)) throw new Error('九型人格选项无效');
      scores[dim] += 1;
    });
  } else {
    test.scoring.mapping.forEach(item => {
      const entry = byId[questionKey(item.q)];
      if (!entry) throw new Error('评分题目缺失');
      const value = entry.option.value;
      const direction = item.direction === -1 ? -1 : 1;
      let points;
      if (test.id === 'ie') {
        points = value === 'E' ? 1 : 0; // Existing resultRule expects an E count out of 15.
      } else if (test.id === 'mbti') {
        points = ['E', 'S', 'T', 'J'].includes(value) ? direction : -direction;
      } else {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error('评分选项无效');
        // Reverse-keyed 1–5 items use 6 - value; negation would change the dimension range.
        points = test.id === 'bigfive' && direction === -1 ? 6 - number : number * direction;
      }
      scores[item.dim] = (scores[item.dim] || 0) + points;
    });
  }
  const resultType = test.id === 'bigfive' ? 'profile' : test.scoring.resultRule(scores);
  if (typeof resultType !== 'string' || !resultType) throw new Error('无法生成测试结果');
  return { scores, resultType };
}

function resolveReport(test, record) {
  if (!test || !record || record.testId !== test.id) return null;
  // The old numeric-ID lookup produced empty scores yet still returned default
  // MBTI/IE/shadow labels. Keep the archive record, but never present that label
  // as a valid assessment. Genuine old SBTI results retain non-empty scores.
  if (record.scoringVersion !== SCORING_VERSION &&
      (!record.scores || Object.keys(record.scores).length === 0)) return null;
  if (test.id === 'bigfive' && record.scoringVersion === SCORING_VERSION) {
    const dimensions = BIG_FIVE.map(([id, label]) => {
      const count = test.scoring.mapping.filter(item => item.dim === id).length;
      const raw = record.scores[id];
      if (!Number.isFinite(raw) || raw < count || raw > count * 5) return null;
      const mean = raw / count;
      const level = mean > 3 ? 'high' : mean < 3 ? 'low' : 'middle';
      const report = test.reports.find(item => item.type === `${level}_${id}`);
      return {
        id, label, score: mean.toFixed(2), percent: Math.round((mean - 1) / 4 * 100),
        level: level === 'high' ? '偏高' : level === 'low' ? '偏低' : '居中',
        summary: report ? report.summary : '本次作答处于量表中间位置。',
        advice: report ? report.advice : '可以结合具体生活场景，继续观察自己的偏好。'
      };
    });
    if (dimensions.some(item => !item)) return null;
    return {
      type: 'profile', title: '你的五维特质',
      summary: '五个角度，看看此刻的自己。',
      description: '以下为本次自评的维度均分，范围为 1–5 分。各维度分别呈现，不合并成人格优劣排名。',
      advice: '将这次结果留作一次观察，下次复测时可以回看同版本的记录。',
      note: '图中进度表示量表位置，不是人群百分位。', dimensions
    };
  }
  if (typeof record.resultType !== 'string') return null;
  const result = test.reports.find(item => item.type === record.resultType);
  if (!result) return null;
  const report = Object.assign({}, result);
  if (test.id === 'enneagram' && record.scoringVersion === SCORING_VERSION) {
    const max = Math.max.apply(null, Object.keys(record.scores).map(key => record.scores[key]));
    const ties = Object.keys(record.scores).filter(key => record.scores[key] === max);
    if (ties.length > 1) report.note = `本次 ${ties.join('、')} 型得分并列，当前按类型顺序展示，建议结合各型描述理解。`;
  }
  return report;
}

module.exports = { scoreTest, resolveReport, SCORING_VERSION, TEST_VERSION };
