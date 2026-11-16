// Private comparison logic lives with reports. Listing pages use only the
// lightweight compatibility helper and never import questionnaire definitions.
const { resolveReport, SCORING_VERSION, TEST_VERSION } = require('../../utils/scoring.js');
const { buildComparison } = require('./deep-report.js');
const { chronologicalEntries } = require('../../utils/comparison-records.js');
const { getContextLabel } = require('../../utils/life-context.js');
const reachableCache = new WeakMap();
const enneagramCache = new WeakMap();

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function version(record) { return record.testVersion || TEST_VERSION; }
function dateLabel(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function reachableClassicScores(test) {
  if (reachableCache.has(test)) return reachableCache.get(test);
  const possible = new Map(test.scoring.dimensions.map(id => [String(id), new Set([0])]));
  const byId = new Map(test.questions.map(question => [String(question.id).replace(/^q/, ''), question]));
  for (const item of test.scoring.mapping || []) {
    const question = byId.get(String(item.q).replace(/^q/, ''));
    const prior = possible.get(String(item.dim));
    if (!question || !prior) return null;
    const direction = item.direction === -1 ? -1 : 1;
    const points = question.options.map(option => {
      if (test.id === 'ie') return option.value === 'E' ? 1 : 0;
      if (test.id === 'mbti') return ['E', 'S', 'T', 'J'].includes(option.value) ? direction : -direction;
      const number = Number(option.value);
      return test.id === 'bigfive' && direction === -1 ? 6 - number : number * direction;
    });
    if (!points.every(Number.isFinite)) return null;
    const next = new Set();
    prior.forEach(total => points.forEach(point => next.add(total + point)));
    if (next.size > 50000) return null;
    possible.set(String(item.dim), next);
  }
  reachableCache.set(test, possible);
  return possible;
}

function reachableEnneagramScores(test, scores) {
  let rules = enneagramCache.get(test);
  if (!rules) {
    const ids = test.scoring.dimensions.map(String);
    // The published nine-type questionnaire is small. Every subset of types
    // needs enough adjacent questions to supply its requested votes (Hall's
    // condition), which also rejects jointly impossible but individually
    // plausible totals without trying combinations of 36 answers.
    if (!ids.length || ids.length > 12) return false;
    const bits = new Map(ids.map((id, index) => [id, 1 << index]));
    const questionMasks = test.questions.map(question => question.options.reduce((mask, option) => mask | (bits.get(String(option.value)) || 0), 0));
    if (questionMasks.some(mask => !mask)) return false;
    const size = 1 << ids.length;
    const constraints = [];
    for (let mask = 1; mask < size; mask++) {
      const bit = mask & -mask;
      constraints.push({ mask, rest: mask ^ bit, index: Math.log2(bit), capacity: questionMasks.reduce((count, options) => count + ((options & mask) ? 1 : 0), 0) });
    }
    rules = { ids, size, constraints, values: new Map() };
    enneagramCache.set(test, rules);
  }
  const values = rules.ids.map(id => scores[id]);
  const key = values.join(',');
  if (rules.values.has(key)) return rules.values.get(key);
  let possible = values.every(value => Number.isInteger(value) && value >= 0 && value <= test.questions.length) &&
    values.reduce((sum, value) => sum + value, 0) === test.questions.length;
  if (possible) {
    const totals = new Uint16Array(rules.size);
    for (const condition of rules.constraints) {
      const total = totals[condition.rest] + values[condition.index];
      totals[condition.mask] = total;
      if (total > condition.capacity) { possible = false; break; }
    }
  }
  rules.values.set(key, possible);
  if (rules.values.size > 128) rules.values.delete(rules.values.keys().next().value);
  return possible;
}

function validStructure(test, record) {
  // The selected questionnaire is already loaded here. Validate retained
  // records against that version's rules rather than today's lightweight
  // listing titles or dimension metadata, which may have changed since then.
  return !!record && typeof record === 'object' && !Array.isArray(record) &&
    typeof record.id === 'string' && !!record.id && record.testId === test.id &&
    record.scoringVersion === SCORING_VERSION && !record.migrated &&
    (record.testVersion === undefined || typeof record.testVersion === 'string' && /^[1-9]\d*$/.test(record.testVersion)) &&
    typeof record.completedAt === 'string' && Number.isFinite(Date.parse(record.completedAt)) &&
    record.scores && typeof record.scores === 'object' && !Array.isArray(record.scores) &&
    Object.keys(record.scores).length <= 30 && Object.values(record.scores).every(value => Number.isFinite(value) && Math.abs(value) <= 1e9);
}

function validRecord(test, record) {
  if (!validStructure(test, record)) return null;
  if (record.premiumUnlockedAt !== undefined && (typeof record.premiumUnlockedAt !== 'string' || !Number.isFinite(Date.parse(record.premiumUnlockedAt)))) return null;
  if (test.scoring.strategy !== 'profile' && version(record) !== (test.testVersion || TEST_VERSION)) return null;
  const effective = test.scoring.strategy === 'profile'
    ? require('../../utils/profile-scoring.js').resolveProfileVersion(test, record.testVersion) : test;
  if (!effective) return null;
  const dimensions = effective.scoring.dimensions.map(String);
  const keys = Object.keys(record.scores);
  if (keys.length !== dimensions.length || keys.some(id => !dimensions.includes(id))) return null;
  try {
    if (test.id === 'enneagram') {
      if (!reachableEnneagramScores(test, record.scores)) return null;
    } else if (!['profile', 'weighted-ranking'].includes(test.scoring.strategy)) {
      const possible = reachableClassicScores(test);
      if (!possible || !keys.every(id => possible.get(id) && possible.get(id).has(record.scores[id]))) return null;
    }
    if (!['profile', 'weighted-ranking'].includes(test.scoring.strategy) &&
        (test.id === 'bigfive' ? record.resultType !== 'profile' : test.scoring.resultRule(record.scores) !== record.resultType)) return null;
    return resolveReport(test, record);
  } catch (error) { return null; }
}

function normalized(record) { return Object.assign({}, record, { testVersion: version(record) }); }
function recordSummary(record, title) {
  return {
    id: record.id, title, date: dateLabel(record.completedAt),
    contextLabel: getContextLabel(record.lifeContext),
    restoredFromSummary: !!(record.treeSnapshot && record.treeSnapshot.restoredFromSummary)
  };
}

function buildComparisonModel(test, records, options = {}) {
  if (!test || !test.scoring) throw failure('test', '没有找到这项测试，请返回档案重新选择。');
  const entries = chronologicalEntries(records).filter(entry => entry.record.testId === test.id);
  const requested = options.recordId;
  const selected = requested ? entries.find(entry => entry.record.id === requested) : null;
  if (requested && !selected) throw failure('record', '这份记录不在当前设备，无法自动换成另一份报告。');
  const titles = new Map();
  const rankingRounds = new Map();
  const valid = entries.filter(entry => {
    const result = validRecord(test, entry.record);
    if (!result) return false;
    titles.set(entry.record.id, result.title);
    if (test.scoring.strategy === 'weighted-ranking') rankingRounds.set(entry.record.id, result.rankingRoundCount);
    return true;
  });
  const currentIndex = requested ? valid.findIndex(entry => entry.record.id === requested) : 0;
  if (!valid.length || currentIndex < 0) throw failure('record', '这份记录的版本或分数暂时无法比较，原始记录仍会保留。');
  const current = valid[currentIndex].record;
  const candidates = valid.slice(currentIndex + 1).filter(entry => {
    if (version(entry.record) !== version(current)) return false;
    // Every record already passed the selected version's complete validation.
    // Build chart data only for the selected pair; repeating it for thousands
    // of candidate baselines duplicates current-score work on the first view.
    return test.scoring.strategy !== 'weighted-ranking' || rankingRounds.get(entry.record.id) === rankingRounds.get(current.id);
  });
  if (!candidates.length) throw failure('history', '还需要同一版本的另一次记录，才可以把两次的自己放在一起看看。');
  const previousEntry = options.previousRecordId
    ? candidates.find(entry => entry.record.id === options.previousRecordId) : candidates[0];
  if (!previousEntry) throw failure('baseline', '选中的历史记录无法与本次比较，请返回后选择同一版本的较早记录。');
  const previous = previousEntry.record;
  const comparison = buildComparison(test, normalized(current), normalized(previous));
  if (!comparison) throw failure('baseline', '选中的历史记录无法与本次比较，请返回后选择同一版本的较早记录。');
  let pendingGrant = null;
  if (!current.premiumUnlockedAt && typeof options.pendingGrantFor === 'function') {
    try {
      const receipt = options.pendingGrantFor(current.id);
      if (receipt && receipt.recordId === current.id && typeof receipt.completedAt === 'string' && Number.isFinite(Date.parse(receipt.completedAt))) pendingGrant = receipt;
    } catch (error) { /* Unavailable receipt storage cannot block free history. */ }
  }
  const full = test.scoring.strategy === 'profile' || !!current.premiumUnlockedAt || !!pendingGrant;
  const rows = (full ? comparison.changes : comparison.basicChanges).map(item => ({
    id: item.id, label: item.label, before: item.before, after: item.after, delta: item.delta,
    deltaText: item.delta === 0 ? '位置相近' : `${item.delta > 0 ? '+' : ''}${item.delta} 个百分点`,
    toward: item.toward, left: item.left || '', right: item.right || '', unit: item.unit || '自评位置'
  }));
  const before = recordSummary(previous, titles.get(previous.id));
  const after = recordSummary(current, titles.get(current.id));
  const elapsed = Math.max(0, Date.parse(current.completedAt) - Date.parse(previous.completedAt));
  const intervalLabel = before.date.slice(0, 10) === after.date.slice(0, 10) ? '同一天的两次记录'
    : elapsed < 86400000 ? '相隔不到一天' : `相隔 ${Math.floor(elapsed / 86400000)} 天`;
  return {
    current, previous,
    candidateRecords: candidates.map(entry => entry.record),
    candidateSummary(record) { return recordSummary(record, titles.get(record.id)); },
    view: {
      test: { id: test.id, name: test.name, icon: test.icon || '✦' }, before, after,
      dimensions: rows, note: comparison.note, headline: comparison.headline,
      axisCaption: test.id === 'enneagram' ? '本次选择占比' : test.scoring.strategy === 'weighted-ranking' ? '本次相对优先度' : '本次自评位置',
      reflection: comparison.reflection, intervalLabel, versionLabel: `V${version(current)}`,
      limited: !full && comparison.changes.length > rows.length,
      hiddenDimensionCount: full ? 0 : Math.max(0, comparison.changes.length - rows.length),
      premiumSavePending: !!pendingGrant,
      baselineCount: candidates.length
    }
  };
}

module.exports = { buildComparisonModel, dateLabel };
