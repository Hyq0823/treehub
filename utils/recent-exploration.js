// A compact view of existing local history. Listing pages do not load the
// questionnaire or copy answers and historical tree snapshots into setData.
const { catalog, resolveResultTitle, treeAssociations } = require('../data/test-catalog.js');
const { getContextLabel } = require('./life-context.js');

function validSummary(record) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id ||
      record.scoringVersion !== '2' || record.migrated ||
      typeof record.completedAt !== 'string' || !Number.isFinite(Date.parse(record.completedAt)) ||
      record.testVersion !== undefined && (typeof record.testVersion !== 'string' || !/^[1-9]\d*$/.test(record.testVersion)) ||
      !record.scores || typeof record.scores !== 'object' || Array.isArray(record.scores)) return false;
  const values = Object.values(record.scores);
  if (!values.length || values.length > 30 || values.some(value => !Number.isFinite(value) || Math.abs(value) > 1e9)) return false;
  const association = treeAssociations[record.testId];
  if (association && (values.length !== association.dimensions.length || association.dimensions.some(id =>
    !Number.isInteger(record.scores[id]) || record.scores[id] < association.minimum || record.scores[id] > association.maximum))) return false;
  const title = resolveResultTitle(record.testId, record);
  return typeof title === 'string' && !!title.trim();
}

function dateLabel(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function getRecentExploration(records) {
  if (!Array.isArray(records)) return null;
  const known = new Map(catalog.map(test => [test.id, test]));
  const valid = new Map();
  records.forEach((record, index) => {
    if (!known.has(record && record.testId) || !validSummary(record)) return;
    const time = Date.parse(record.completedAt);
    const previous = valid.get(record.id);
    if (!previous || time > previous.time) valid.set(record.id, { record, time, index });
  });
  let latest = null;
  valid.forEach(item => {
    if (!latest || item.time > latest.time || item.time === latest.time && item.index < latest.index) latest = item;
  });
  if (!latest) return null;
  const record = latest.record;
  const version = record.testVersion || '1';
  let sameTestCount = 0, sameVersionCount = 0;
  valid.forEach(item => {
    if (item.record.testId !== record.testId) return;
    sameTestCount++;
    if ((item.record.testVersion || '1') === version) sameVersionCount++;
  });
  const ringNumber = sameVersionCount - 1;
  const versionChanged = !ringNumber && sameTestCount > 1;
  const test = known.get(record.testId);
  return {
    recordId: record.id, testId: record.testId, testName: test.name,
    title: resolveResultTitle(record.testId, record), dateLabel: dateLabel(record.completedAt),
    contextLabel: getContextLabel(record.lifeContext),
    ringNumber, isRing: ringNumber > 0, versionChanged,
    growthLabel: ringNumber ? `第 ${ringNumber} 圈年轮` : versionChanged ? '新版本记录' : '一片新的探索叶',
    restoredFromSummary: !!(record.treeSnapshot && record.treeSnapshot.restoredFromSummary)
  };
}

module.exports = { getRecentExploration, validSummary };
