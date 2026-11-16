// Public metadata only: never import questionnaires or infer an emotional state.
const { catalog } = require('../data/test-catalog.js');
const display = require('../data/exploration.js');
const { validSummary } = require('./recent-exploration.js');
const INTENTS = [
  { id: 'relationship', label: '关系相处' }, { id: 'emotion', label: '情绪充电' },
  { id: 'direction', label: '生活方向' }, { id: 'playful', label: '轻松探索' }
];
const PICKS = {
  relationship: ['friendshipstyle', 'relationshiprhythm', 'gentleboundaries'],
  emotion: ['emotionalrecharge', 'firstreaction', 'gentleboundaries', 'shadow'],
  direction: ['lifepath', 'cityvibe', 'hiddentalent', 'mbti', 'bigfive', 'ie'],
  playful: ['firstreaction', 'historicalecho', 'sbti']
};

function buildExplorationGuide(records, draft, intent = 'playful') {
  const intentId = Object.prototype.hasOwnProperty.call(PICKS, intent) ? intent : 'playful';
  const known = new Map(catalog.map(test => [test.id, test]));
  const latest = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || !known.has(record.testId) || !validSummary(record)) continue;
    const time = Date.parse(record.completedAt);
    if (!Number.isFinite(time)) continue;
    if (!latest.has(record.testId) || time > latest.get(record.testId)) latest.set(record.testId, time);
  }
  if (draft && known.has(draft.testId)) {
    const test = known.get(draft.testId);
    return {
      mode: 'resume', intentId, testId: test.id, title: display.tests[test.id].title || test.name,
      symbol: test.icon, prompt: draft.allAnswered ? '答案已经收齐，回来检查后就能生成报告。' : '不必重新开始，按自己的节奏继续。',
      meta: draft.allAnswered ? '上次已全部答完' : draft.ranking
        ? `已排好 ${draft.selectedCount} 个选择` : `已记录 ${draft.answeredCount} / ${draft.totalCount} 题`,
      progressPercent: Number.isFinite(draft.progressPercent) ? Math.max(0, Math.min(100, draft.progressPercent))
        : Math.round(draft.answeredCount / draft.totalCount * 100),
      buttonLabel: draft.allAnswered ? '检查上次的答案 →' : '继续这份探索 →'
    };
  }
  const candidates = PICKS[intentId].filter(id => known.has(id));
  const unexplored = candidates.find(id => !latest.has(id));
  // When this direction is collected, revisit its least recent assessment.
  // This is an invitation to observe change, never a task or accuracy claim.
  const testId = unexplored || candidates.reduce((oldest, id) =>
    !oldest || latest.get(id) < latest.get(oldest) ? id : oldest, '');
  const test = known.get(testId);
  if (!test) return null;
  const metadata = display.tests[testId];
  return {
    mode: unexplored ? 'discover' : 'revisit', intentId, testId,
    title: metadata.title || test.name, symbol: metadata.symbol || test.icon,
    prompt: unexplored ? metadata.prompt : '这一面已经收藏过了。最近有点不同，也可以再看看。',
    meta: `${test.questionsCount} 题 · ${test.time}${unexplored ? ' · 一份新的发现' : ' · 再记录此刻的你'}`,
    progressPercent: 0,
    buttonLabel: unexplored ? '从这份探索开始 →' : '重新看看这一面 →'
  };
}

module.exports = { INTENTS, buildExplorationGuide };
