const { SPECIES, STAGES } = require('../data/trees.js');

function hash(value) {
  let result = 2166136261;
  const source = String(value || 'tree');
  for (let i = 0; i < source.length; i++) {
    result ^= source.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function getTree(archive, catalog) {
  const records = archive.records || [];
  const available = Array.isArray(catalog) ? catalog : [];
  const ids = new Set(available.map(test => test.id));
  const latest = {};
  // Archive records are newest first. A repeated assessment never earns an extra level.
  records.forEach(record => {
    if ((!available.length || ids.has(record.testId)) && !latest[record.testId]) latest[record.testId] = record;
  });
  const uniqueCount = Object.keys(latest).length;
  let stage = STAGES[0];
  STAGES.forEach(candidate => { if (candidate.threshold <= uniqueCount) stage = candidate; });
  const nextStage = STAGES.find(candidate => candidate.threshold > uniqueCount && candidate.threshold <= available.length) || null;
  const progress = nextStage ? Math.round((uniqueCount - stage.threshold) / (nextStage.threshold - stage.threshold) * 100) : (uniqueCount ? 100 : 0);
  const weights = {};
  SPECIES.forEach(species => { weights[species.id] = 0; });
  const evidence = [];
  const add = (id, weight) => { weights[id] += weight; };
  const usable = id => latest[id] && latest[id].scoringVersion === '2';

  // These associations are transparent design choices, not a new psychological scale.
  // SBTI and shadow tests contribute exploration history, never diagnostic inferences.
  if (usable('mbti') && /^[EI][SN][TF][JP]$/.test(latest.mbti.resultType)) {
    const type = latest.mbti.resultType;
    add(type[0] === 'I' ? 'ginkgo' : 'banyan', 2);
    add(type[1] === 'N' ? 'maple' : 'pine', 1);
    add(type[2] === 'F' ? 'willow' : 'ginkgo', 1);
    add(type[3] === 'J' ? 'pine' : 'maple', 1);
    evidence.push(`十六型最近一次结果为 ${type}，为枝叶姿态提供一种视觉参考。`);
  }
  if (usable('ie') && ['E', 'I', 'E/I'].indexOf(latest.ie.resultType) !== -1) {
    const type = latest.ie.resultType;
    add(type === 'E' ? 'banyan' : type === 'I' ? 'ginkgo' : 'olive', 2);
    evidence.push(`内外向最近一次结果为 ${type}，用于表达连接或独处的探索意象。`);
  }
  if (usable('enneagram') && /^[1-9]$/.test(latest.enneagram.resultType)) {
    const association = { '1': 'pine', '2': 'banyan', '3': 'pine', '4': 'willow', '5': 'ginkgo', '6': 'olive', '7': 'maple', '8': 'pine', '9': 'olive' };
    add(association[latest.enneagram.resultType], 2);
    evidence.push(`九型最近一次结果为 ${latest.enneagram.resultType} 型，为树形寓意提供一种参考。`);
  }
  if (usable('bigfive')) {
    const scores = latest.bigfive.scores || {};
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    if (dimensions.every(dim => Number.isFinite(scores[dim]) && scores[dim] >= 8 && scores[dim] <= 40)) {
      // Eight 1..5 items per dimension in the current catalog. Use only centered
      // within-dimension values; do not compare raw sums across unrelated tests.
      const centered = dim => (scores[dim] - 24) / 16;
      if (centered('openness') > 0) add('maple', centered('openness') * 3);
      if (centered('conscientiousness') > 0) add('pine', centered('conscientiousness') * 3);
      if (centered('extraversion') > 0) add('banyan', centered('extraversion') * 3);
      if (centered('extraversion') < 0) add('ginkgo', -centered('extraversion') * 3);
      if (centered('agreeableness') > 0) add('olive', centered('agreeableness') * 3);
      // Neuroticism is deliberately not turned into a negative or ranked tree.
      if (!Object.keys(weights).some(id => weights[id] > 0)) add('olive', 1);
      evidence.push('大五最近一次的维度分数用于丰富树形；这些视觉对应没有高低之分。');
    }
  }
  const maximum = Math.max.apply(null, Object.keys(weights).map(id => weights[id]));
  const candidates = SPECIES.filter(species => weights[species.id] === maximum);
  const variant = hash(archive.seed) % 10000;
  const species = maximum > 0 ? candidates[hash(archive.seed + ':species') % candidates.length] : null;
  return {
    speciesId: species ? species.id : 'seed',
    name: species ? species.name : '探索之树',
    meaning: species ? species.meaning : '好奇 · 生长',
    message: species ? species.message : '你的探索之树正在等待更多线索。试着了解自己的性格偏好，枝叶会随着认识自己而逐渐丰富。',
    stage: Object.assign({}, stage),
    nextStage: nextStage ? Object.assign({}, nextStage) : null,
    remaining: nextStage ? nextStage.threshold - uniqueCount : 0,
    progress,
    uniqueCount,
    totalCount: records.length,
    variant,
    evidence,
    matchingVersion: '1'
  };
}

module.exports = { getTree, hash };
