// Recommendations use public metadata and completed test IDs only. Never load
// questionnaires or send a person's answers, scores or record ID into a route.
const { catalog } = require('../data/test-catalog.js');
const display = require('../data/exploration.js');
const NEXT = {
  relationshiprhythm: ['gentleboundaries', 'emotionalrecharge'],
  gentleboundaries: ['emotionalrecharge', 'relationshiprhythm'],
  emotionalrecharge: ['gentleboundaries', 'relationshiprhythm'],
  firstreaction: ['emotionalrecharge', 'gentleboundaries'],
  historicalecho: ['hiddentalent', 'lifepath'],
  hiddentalent: ['lifepath', 'emotionalrecharge'],
  lifepath: ['gentleboundaries', 'hiddentalent'],
  mbti: ['relationshiprhythm', 'emotionalrecharge'],
  bigfive: ['gentleboundaries', 'emotionalrecharge'],
  enneagram: ['relationshiprhythm', 'gentleboundaries'],
  ie: ['emotionalrecharge', 'relationshiprhythm'],
  sbti: ['historicalecho', 'hiddentalent'],
  shadow: ['emotionalrecharge', 'gentleboundaries']
};

function recommendTests(currentId, records, limit = 2) {
  if (!catalog.some(test => test.id === currentId)) return [];
  const completed = new Set((Array.isArray(records) ? records : []).filter(record =>
    record && record.scoringVersion === '2' && !record.migrated).map(record => record.testId));
  const preferred = Object.prototype.hasOwnProperty.call(NEXT, currentId) ? NEXT[currentId] : [];
  const ids = Array.from(new Set(preferred.concat(catalog.map(test => test.id))));
  const candidates = ids.filter(id => id !== currentId && catalog.some(test => test.id === id));
  return candidates.filter(id => !completed.has(id)).concat(candidates.filter(id => completed.has(id)))
    .slice(0, Math.min(2, Math.max(0, Number.isInteger(limit) ? limit : 2)))
    .map(id => {
      const test = catalog.find(item => item.id === id);
      const metadata = display.tests[id] || {};
      return {
        id, title: metadata.title || test.name, prompt: metadata.prompt || test.description,
        symbol: metadata.symbol || test.icon, time: test.time, questionsCount: test.questionsCount,
        repeat: completed.has(id)
      };
    });
}

module.exports = { recommendTests };
