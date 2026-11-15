const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { getRecentExploration } = require('../utils/recent-exploration.js');

function record(id, overrides = {}) {
  return {
    id, testId: 'mbti', scoringVersion: '2', testVersion: '1',
    resultType: 'INFP', scores: { EI: -3, SN: -3, TF: -3, JP: -3 },
    completedAt: '2026-11-15T12:00:00.000Z', ...overrides
  };
}

test('recent view selects by actual date, records same-version rings and omits private payloads', () => {
  const old = record('old', { completedAt: '2026-09-01T12:00:00.000Z' });
  const latest = record('latest', { lifeContext: 'work', answers: [0, 1], treeSnapshot: { speciesId: 'willow' } });
  const other = record('other', { testId: 'ie', resultType: 'I', scores: { EI: 0 }, completedAt: '2026-10-01T12:00:00.000Z' });
  const before = structuredClone([old, latest, other]);
  const recent = getRecentExploration([old, latest, other]);
  assert.equal(recent.recordId, 'latest');
  assert.equal(recent.title, '调停者');
  assert.equal(recent.ringNumber, 1);
  assert.equal(recent.growthLabel, '第 1 圈年轮');
  assert.equal(recent.contextLabel, '工作变化');
  assert.match(recent.dateLabel, /2026\.11/);
  for (const key of ['answers', 'scores', 'treeSnapshot', 'completedAt']) assert.equal(key in recent, false);
  assert.deepEqual([old, latest, other], before);
});

test('empty, migrated, broken and unknown summaries do not become a retake invitation', () => {
  for (const input of [undefined, null, [], {}, 'history']) assert.equal(getRecentExploration(input), null);
  const broken = [
    record('legacy', { scoringVersion: 'legacy' }), record('migrated', { migrated: true }),
    record('unknown', { testId: 'missing' }), record('date', { completedAt: 'not-a-date' }),
    record('empty', { scores: {} }), record('bad-score', { scores: { EI: NaN } }),
    record('wrong-type', { resultType: 'constructor' }), record('', {}),
    record('bad-version', { testVersion: 'future' }), record('numeric-version', { testVersion: 2 }),
    record('profile-score', { testId: 'hiddentalent', resultType: 'insight', scores: { insight: 999 } })
  ];
  assert.equal(getRecentExploration(broken), null);
  assert.equal(getRecentExploration([broken[0], record('valid')]).recordId, 'valid');
});

test('versions and duplicate IDs do not produce false rings or new exploration leaves', () => {
  const score = { expression: 10, curiosity: 7, resolve: 9, empathy: 8 };
  const first = record('v1', { testId: 'historicalecho', resultType: 'sushi', scores: score, completedAt: '2026-10-01T12:00:00.000Z' });
  const second = record('v2', { testId: 'historicalecho', testVersion: '2', resultType: 'sushi', scores: score });
  const versionStart = getRecentExploration([second, first]);
  assert.equal(versionStart.ringNumber, 0);
  assert.equal(versionStart.versionChanged, true);
  assert.equal(versionStart.growthLabel, '新版本记录');
  const repeated = record('v2-repeat', { ...second, id: 'v2-repeat', completedAt: '2026-11-16T12:00:00.000Z' });
  assert.equal(getRecentExploration([repeated, second, first]).ringNumber, 1);
  const unique = record('one');
  assert.equal(getRecentExploration([unique, { ...unique }]).ringNumber, 0);
  assert.equal(getRecentExploration([unique]).growthLabel, '一片新的探索叶');
});

test('summary-only recovery preserves its date without inventing the local life context', () => {
  const summary = record('restored', { treeSnapshot: { restoredFromSummary: true } });
  const recent = getRecentExploration([summary]);
  assert.equal(recent.contextLabel, '');
  assert.equal(recent.restoredFromSummary, true);
  assert.match(recent.dateLabel, /2026\.11/);
  assert.equal(getRecentExploration([record('bad-context', { lifeContext: 'unknown' })]).contextLabel, '');
});

function hallWith(records, nextUnlock = null) {
  const file = path.resolve(__dirname, '../pages/test-hall/index.js');
  const nativeRequire = createRequire(file);
  const navigation = [], requests = [], toasts = [];
  let definition, archiveReads = 0, themeReads = 0;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { definition = value; }, console, setTimeout, clearTimeout,
    wx: { navigateTo(value) { navigation.push(value); }, showToast(value) { toasts.push(value); } },
    require(id) {
      requests.push(id);
      assert.equal(id.includes('test-loader'), false, 'the recent card must not load a questionnaire');
      assert.equal(id.includes('data/tests/index'), false, 'the hall must not load the full catalog');
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id.endsWith('/archive.js')) return { getArchive() { archiveReads++; return { seed: 'recent', records }; } };
      if (id === '../../utils/themes.js') return { getState(input) {
        themeReads++; assert.equal(input, records);
        return { selectedId: 'adventurer', nextUnlock, catalog: [{ unlocked: !nextUnlock }] };
      } };
      if (id.endsWith('/theme-assets.js')) return { resolveThemeAsset: async () => '' };
      if (id.endsWith('/tab-bar.js')) return { syncTabBar() {} };
      return nativeRequire(id);
    }
  }, { filename: file });
  definition.data = structuredClone(definition.data);
  definition.setData = update => Object.assign(definition.data, update);
  definition.loadTests();
  return { page: definition, navigation, requests, toasts, archiveReads: () => archiveReads, themeReads: () => themeReads };
}

test('hall reuses the existing history, keeps retakes ordinary and opens the exact previous report', () => {
  const saved = record('saved-with-private-context', { lifeContext: 'breakup' });
  const env = hallWith([saved]);
  assert.equal(env.page.data.recentExploration.contextLabel, '分手后');
  assert.equal(env.archiveReads(), 1);
  assert.equal(env.themeReads(), 1);
  env.page.retakeRecent();
  assert.equal(env.navigation[0].url, '/pages/test-detail/index?id=mbti');
  assert.doesNotMatch(env.navigation[0].url, /breakup|context|recordId/);
  env.page.openRecentReport();
  assert.equal(env.navigation.length, 1, 'rapid taps cannot stack retake and historical pages');
  env.navigation[0].fail();
  assert.match(env.toasts[0].title, /请再试一次/);
  env.page.openRecentReport();
  assert.equal(env.navigation[1].url, '/packages/reports/index?id=mbti&recordId=saved-with-private-context');
  assert.doesNotMatch(env.page.onShareAppMessage().path, /recordId|context/);
  assert.equal(env.archiveReads(), 1);
  assert.equal(env.themeReads(), 1);
});

test('reward text and route follow the actual next theme while first-time visitors see no recent card', () => {
  const next = { id: 'collector', name: '闪光的收藏家', remaining: 1, targetTestId: 'bigfive', hint: '完成大五人格探索后长出' };
  const env = hallWith([record('saved')], next);
  assert.equal(env.page.data.rewardTitle, next.hint);
  env.page.exploreReward();
  assert.equal(env.navigation[0].url, '/pages/test-detail/index?id=bigfive');
  const empty = hallWith([]);
  assert.equal(empty.page.data.recentExploration, null);
  assert.match(empty.page.data.rewardTitle, /首测/);
  empty.page.retakeRecent();
  assert.equal(empty.navigation.length, 0);
});

test('an unclaimed ready starter routes back to its report rather than asking for zero more tests', () => {
  const ready = { id: 'adventurer', name: '柔软的冒险家', remaining: 0, targetTestId: '', hint: '首测已完成，可领取为你推荐的主题' };
  const env = hallWith([record('unclaimed-first')], ready);
  assert.equal(env.page.data.rewardTitle, ready.hint);
  assert.equal(env.page.data.rewardReady, true);
  assert.doesNotMatch(env.page.data.rewardTitle, /再探索 0/);
  env.page.exploreReward();
  assert.equal(env.navigation[0].url, '/packages/reports/index?id=mbti&recordId=unclaimed-first');
});
