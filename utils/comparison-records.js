// Listing pages only need safe history hints. Full score/version validation
// belongs to the comparison page, which loads the selected questionnaire.
const { catalog } = require('../data/test-catalog.js');
const { validSummary } = require('./recent-exploration.js');
const knownIds = new Set(catalog.map(test => test.id));

function isComparableSummary(record) {
  return !!record && knownIds.has(record.testId) && validSummary(record);
}

function versionKey(record) {
  if (!isComparableSummary(record)) return '';
  return `${record.testId}:${record.testVersion || '1'}:${record.scoringVersion}`;
}

function uniqueEntries(records) {
  const unique = new Map();
  (Array.isArray(records) ? records : []).forEach((record, order) => {
    if (!record || typeof record.id !== 'string' || !record.id || typeof record.testId !== 'string' || !record.testId) return;
    const parsed = Date.parse(record.completedAt);
    const time = Number.isFinite(parsed) ? parsed : -Infinity;
    const previous = unique.get(record.id);
    if (!previous || time > previous.time) unique.set(record.id, { record, time, order });
  });
  return Array.from(unique.values());
}

function chronologicalEntries(records) {
  return uniqueEntries(records).sort((first, second) => second.time - first.time || first.order - second.order);
}

function findPreviousRecord(current, records) {
  const key = versionKey(current);
  if (!key || !Array.isArray(records)) return null;
  const entries = uniqueEntries(records);
  const currentEntry = entries.find(entry => entry.record.id === current.id);
  const currentTime = Date.parse(current.completedAt);
  if (!currentEntry || currentEntry.time !== currentTime || versionKey(currentEntry.record) !== key) return null;
  const currentOrder = currentEntry.order;
  let selected = null;
  entries.forEach(({ record, order, time }) => {
    if (!record || record.id === current.id || versionKey(record) !== key) return;
    if (time > currentTime || time === currentTime && order < currentOrder) return;
    if (!selected || time > selected.time || time === selected.time && order < selected.order) selected = { record, time, order };
  });
  return selected ? selected.record : null;
}

module.exports = { isComparableSummary, versionKey, chronologicalEntries, findPreviousRecord };
