// Version 2: match numeric/q-prefixed question IDs and keep each test's score semantics.
const SCORING_VERSION = '2';
const TEST_VERSION = '1';
const BIG_FIVE = [
  ['openness', '开放性'], ['conscientiousness', '尽责性'],
  ['extraversion', '外向性'], ['agreeableness', '宜人性'], ['neuroticism', '情绪敏感性']
];

function questionKey(id) { return String(id).replace(/^q/, ''); }

function resolveRankedOption(question, value) {
  if (Number.isInteger(value)) return question.options[value] || null;
  return question.options.find(option => String(option.id || option.value) === String(value)) || null;
}

function rankingRoundCount(weights, scores) {
  if (!Array.isArray(weights) || !weights.length || !weights.every(weight => Number.isFinite(weight) && weight > 0) ||
      !scores || !Object.keys(scores).length || !Object.keys(scores).every(id => Number.isFinite(scores[id]))) return 0;
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const scoreTotal = Object.keys(scores).reduce((sum, id) => sum + scores[id], 0);
  const rounds = scoreTotal / weightTotal;
  return Number.isInteger(rounds) && rounds > 0 && rounds <= 100 ? rounds : 0;
}

function possibleRankingTotals(weights, rounds) {
  let totals = new Set([0]);
  for (let round = 0; round < rounds; round++) {
    const next = new Set();
    totals.forEach(total => weights.forEach(weight => next.add(total + weight)));
    // A ranking questionnaire should stay small. Refuse hostile or accidental
    // configurations rather than spending unbounded time restoring a summary.
    if (next.size > 50000) return null;
    totals = next;
  }
  return totals;
}

function scoreRanking(test, questions, answers) {
  const weights = test.scoring.weights;
  const dimensions = test.scoring.dimensions;
  if (!Array.isArray(weights) || !weights.length || !weights.every(weight => Number.isFinite(weight) && weight > 0) ||
      new Set(weights).size !== weights.length || weights.some((weight, index) => index && weight >= weights[index - 1])) {
    throw new Error('排序评分配置无效');
  }
  if (!Array.isArray(dimensions) || !dimensions.length || new Set(dimensions.map(String)).size !== dimensions.length) {
    throw new Error('排序维度配置无效');
  }
  const canonicalIds = new Set(test.questions.map(question => questionKey(question.id)));
  const incomingIds = new Set(questions.map(question => questionKey(question.id)));
  if (canonicalIds.size !== test.questions.length || incomingIds.size !== questions.length ||
      canonicalIds.size !== incomingIds.size || Array.from(canonicalIds).some(id => !incomingIds.has(id))) {
    throw new Error('题目数据不一致，请重新进入测试');
  }
  const scores = {};
  dimensions.forEach(dim => { scores[dim] = 0; });
  questions.forEach((question, questionIndex) => {
    const optionDimensions = question.options.map(option => String(option.dimension || option.value));
    if (weights.length !== question.options.length || new Set(optionDimensions).size !== dimensions.length ||
        dimensions.some(dimension => !optionDimensions.includes(String(dimension)))) {
      throw new Error('每个排序情境必须完整包含全部维度');
    }
    const ranking = answers[questionIndex];
    if (!Array.isArray(ranking) || ranking.length !== question.options.length) {
      throw new Error('请排完所有选项后再查看报告');
    }
    const seen = new Set();
    ranking.forEach((value, rank) => {
      const option = resolveRankedOption(question, value);
      if (!option) throw new Error('排序选项无效，请重新作答');
      const optionId = String(option.id || option.value);
      if (seen.has(optionId)) throw new Error('排序中出现了重复选项，请重新作答');
      seen.add(optionId);
      const dimension = String(option.dimension || option.value);
      if (!Object.prototype.hasOwnProperty.call(scores, dimension)) throw new Error('排序维度无效');
      scores[dimension] += weights[rank];
    });
  });
  const resultType = test.scoring.resultRule(scores);
  if (typeof resultType !== 'string' || !resultType) throw new Error('无法生成测试结果');
  return { scores, resultType };
}

function scoreTest(test, questions, answers) {
  if (!test || !test.scoring || !Array.isArray(questions) || !Array.isArray(answers) ||
      questions.length !== test.questions.length || answers.length !== questions.length) {
    throw new Error('测试数据不完整，请重新进入测试');
  }
  if (test.scoring.strategy === 'weighted-ranking') return scoreRanking(test, questions, answers);
  if (test.scoring.strategy === 'profile') return require('./profile-scoring.js').scoreProfile(test, questions, answers);
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
  if (test.scoring && test.scoring.strategy === 'profile') {
    test = require('./profile-scoring.js').resolveProfileVersion(test, record.testVersion);
    if (!test) return null;
  }
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
  if (test.scoring.strategy === 'profile') {
    try {
      if (record.scoringVersion !== SCORING_VERSION || (record.testVersion || '1') !== (test.testVersion || '1')) return null;
      const matched = require('./profile-scoring.js').matchProfile(test, record.scores);
      if (matched.type !== record.resultType) return null;
      report.dimensions = matched.dimensions;
      report.note = test.note || '本次结果仅描述自评偏好，不代表能力、命运或职业结论。';
      if (test.id === 'hiddentalent' && Math.max(...matched.dimensions.map(item => item.percent)) -
          Math.min(...matched.dimensions.map(item => item.percent)) < 17) {
        report.summary = '这次五项偏好比较接近，暂时没有特别突出的单一方向。先借这张卡作为一个小实践入口，再观察真实感受。';
        report.tagline = '多向偏好，也可以慢慢试出自己的喜欢。';
        report.profileNotice = '本次未呈现突出方向，卡片意象不代表你的唯一优势。';
      }
      if (matched.ties.length > 1) {
        report.note += ' 本次有多个意象同样接近，按展示顺序呈现一个，可结合各维度理解。';
      }
    } catch (error) { return null; }
  }
  if (test.scoring.strategy === 'weighted-ranking') {
    const meta = Array.isArray(test.scoring.dimensionMeta) ? test.scoring.dimensionMeta : [];
    const weights = test.scoring.weights || [];
    const rounds = rankingRoundCount(weights, record.scores);
    const possibleTotals = rounds ? possibleRankingTotals(weights, rounds) : null;
    const minimum = Math.min.apply(null, weights) * rounds;
    const maximum = Math.max.apply(null, weights) * rounds;
    const dimensionIds = test.scoring.dimensions.map(String);
    const scoreKeys = record.scores && Object.keys(record.scores);
    const metaIds = meta.map(item => String(item.id));
    if (!scoreKeys || scoreKeys.length !== dimensionIds.length || scoreKeys.some(id => !dimensionIds.includes(id)) ||
        metaIds.length !== dimensionIds.length || new Set(metaIds).size !== dimensionIds.length || metaIds.some(id => !dimensionIds.includes(id)) ||
        !possibleTotals || scoreKeys.some(id => !Number.isFinite(record.scores[id]) || record.scores[id] < minimum ||
          record.scores[id] > maximum || !possibleTotals.has(record.scores[id])) ||
        scoreKeys.reduce((sum, id) => sum + record.scores[id], 0) !== weights.reduce((sum, weight) => sum + weight, 0) * rounds ||
        test.scoring.resultRule(record.scores) !== record.resultType) return null;
    const ranked = meta.map(item => ({
      id: item.id, label: item.label, image: item.image, assetPath: item.assetPath,
      score: Number(record.scores[item.id]) || 0
    })).sort((first, second) => second.score - first.score || meta.findIndex(item => item.id === first.id) - meta.findIndex(item => item.id === second.id));
    report.ranking = ranked.map((item, index) => Object.assign({}, item, { rank: index + 1 }));
    report.rankingRoundCount = rounds;
    report.rankingMode = rounds > 1 ? 'aggregate' : 'sequence';
    report.rankingTitle = rounds > 1 ? '我的综合优先方向' : '我的处理动作链';
    report.rankingSubtitle = rounds > 1 ? `综合 ${rounds} 个情境后的相对优先方向，没有高低优劣` : '先后顺序记录的是这一次的直觉，没有标准答案';
    report.dimensions = ranked.map((item, index) => ({
      id: item.id, label: item.label, rank: index + 1, score: item.score,
      scoreText: `第 ${index + 1} 顺位`,
      percent: maximum === minimum ? 50 : Math.round((item.score - minimum) / (maximum - minimum) * 100),
      level: index < 2 ? '优先照顾' : index === ranked.length - 1 ? '容易稍后处理' : '视情境安排',
      summary: `本次排序里，“${item.label}”是你第 ${index + 1} 个照顾的方向。`
    }));
    report.note = '顺位图只描述这一次的直觉排序，不代表能力高低，也不用于判断焦虑程度。';
  }
  if (test.id === 'enneagram' && record.scoringVersion === SCORING_VERSION) {
    const max = Math.max.apply(null, Object.keys(record.scores).map(key => record.scores[key]));
    const ties = Object.keys(record.scores).filter(key => record.scores[key] === max);
    if (ties.length > 1) report.note = `本次 ${ties.join('、')} 型得分并列，当前按类型顺序展示，建议结合各型描述理解。`;
  }
  return report;
}

module.exports = { scoreTest, resolveReport, SCORING_VERSION, TEST_VERSION };
