// Keep the record index on the logic side. Collapsed groups send only their
// latest summary to the view; answers, scores and tree snapshots never go with it.
const { catalog, resolveResultTitle } = require('../data/test-catalog.js');
const { getContextLabel } = require('./life-context.js');
const { versionKey } = require('./comparison-records.js');

const HISTORY_PAGE_SIZE = 5;

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '早期测评记录';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function summarize(entry) {
  if (entry.summary) return entry.summary;
  const record = entry.record;
  const legacy = record.scoringVersion === 'legacy' || !!record.migrated;
  entry.summary = {
    id: record.id, testId: record.testId,
    title: resolveResultTitle(record.testId, record) || '早期测评结果',
    date: legacy ? '旧版导入 · 原测评时间未知' : formatDate(record.completedAt),
    legacy, premiumUnlocked: !!record.premiumUnlockedAt,
    contextLabel: legacy ? '' : getContextLabel(record.lifeContext),
    versionLabel: !legacy && typeof record.testVersion === 'string' && /^[1-9]\d{0,3}$/.test(record.testVersion)
      ? `V${record.testVersion}` : '',
    restoredFromSummary: !!(record.treeSnapshot && record.treeSnapshot.restoredFromSummary)
  };
  return entry.summary;
}

function buildArchiveView(records) {
  const index = new Map(catalog.map(test => [test.id, { entries: [], latest: null, sorted: false }]));
  (Array.isArray(records) ? records : []).forEach((record, order) => {
    if (!record || typeof record.id !== 'string' || !record.id) return;
    const group = index.get(record.testId);
    if (!group) return;
    const parsed = Date.parse(record.completedAt);
    const entry = { record, order, time: Number.isFinite(parsed) ? parsed : -Infinity };
    group.entries.push(entry);
    if (!group.latest || entry.time > group.latest.time) group.latest = entry;
  });
  const groups = catalog.reduce((visible, test) => {
    const group = index.get(test.id);
    const currentKey = group.latest && versionKey(group.latest.record);
    // Only availability crosses into the list view; the comparison page picks
    // and validates the actual previous record. Stop at the first safe hint.
    const comparable = currentKey && group.entries.some(entry => entry.record.id !== group.latest.record.id &&
      versionKey(entry.record) === currentKey);
    if (group.latest) visible.push({
      id: test.id, name: test.name, icon: test.icon,
      count: group.entries.length, latest: summarize(group.latest),
      comparisonRecordId: comparable ? group.latest.record.id : '',
      history: [], visibleCount: 0, hasMore: group.entries.length > 0
    });
    return visible;
  }, []);

  return {
    groups,
    contains(testId, recordId) {
      const group = index.get(testId);
      return !!group && group.entries.some(entry => entry.record.id === recordId);
    },
    history(testId, count = HISTORY_PAGE_SIZE) {
      const group = index.get(testId);
      if (!group || !Number.isInteger(count) || count < 1) return [];
      if (!group.sorted) {
        group.entries.sort((first, second) => second.time - first.time || first.order - second.order);
        group.sorted = true;
      }
      return group.entries.slice(0, count).map(summarize);
    }
  };
}

module.exports = { buildArchiveView, HISTORY_PAGE_SIZE };
