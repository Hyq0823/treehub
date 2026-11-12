const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileTest, resolveProfileVersion } = require('../utils/profile-scoring.js');
const { scoreTest, resolveReport } = require('../utils/scoring.js');
const { buildDeepReport, buildComparison } = require('../packages/reports/deep-report.js');
const archive = require('../utils/archive.js');

function versions() {
  const ids = ['a', 'b', 'c'];
  const profile = (type, position) => ({
    type, title: `意象 ${type}`, vector: Object.fromEntries(ids.map(id => [id, position])),
    summary: '本次生活偏好', description: `${type} 的专属描述`, advice: '从小行动开始',
    tagline: `${type} 的一句话`, strengths: '尝试喜欢的事', watchout: '给自己留空间',
    relationship: '把需要说明白', actions: ['今天记录', '这周尝试', '下次回看']
  });
  const config = {
    id: 'historicalecho', name: '版本兼容示例',
    dimensionMeta: ids.map(id => ({ id, label: id, left: '安静留白', right: '主动探索' })),
    questions: ids.map((id, index) => ({
      id: index + 1, dim: id, text: id,
      options: [1, 2, 3, 4].map(value => ({ text: String(value), value }))
    })),
    profiles: [profile('quiet', 0), profile('active', 100)]
  };
  const previous = createProfileTest({ ...config, testVersion: '1' });
  const current = createProfileTest({ ...config, testVersion: '2',
    profiles: [...config.profiles, profile('new-middle', 33)], retainedVersions: { '1': previous } });
  return { previous, current };
}

function recordFor(quiz, choice) {
  return {
    id: `sample-v${quiz.testVersion}-${choice}`, testId: quiz.id,
    testVersion: quiz.testVersion, scoringVersion: '2', completedAt: '2026-11-12T00:00:00.000Z',
    ...scoreTest(quiz, quiz.questions, quiz.questions.map(() => choice))
  };
}

test('retained profile version resolves an old result even when current prototypes would produce another identity', () => {
  const { previous, current } = versions();
  const old = recordFor(previous, 1);
  const recent = recordFor(current, 1);
  assert.equal(old.resultType, 'quiet');
  assert.equal(recent.resultType, 'new-middle');
  assert.equal(resolveProfileVersion(current, '1'), previous);
  assert.equal(resolveProfileVersion(current, '2'), current);
  const restored = resolveReport(current, old);
  assert.equal(restored.title, '意象 quiet');
  assert.equal(restored.description, previous.reports[0].description);
  assert.equal(restored.retainedVersions, undefined);
  assert.equal(restored.scoring, undefined);
  assert.equal(resolveReport(current, recent).title, '意象 new-middle');
  assert.equal(resolveReport(current, { ...old, resultType: 'new-middle' }), null);
  const versionless = { ...old }; delete versionless.testVersion;
  assert.equal(resolveReport(current, versionless).title, restored.title);
});

test('viewing an unlocked retained report preserves its stored ID, grant and historical snapshot', () => {
  const { previous, current } = versions();
  const memory = new Map();
  global.wx = {
    getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, structuredClone(value))
  };
  const saved = archive.saveResult(recordFor(previous, 1));
  const unlocked = archive.unlockPremium(saved.id);
  const untouched = structuredClone(unlocked);
  const base = resolveReport(current, unlocked);
  const deep = buildDeepReport(current, unlocked, base);
  assert.equal(deep.mode, 'profile');
  assert.equal(deep.dimensions.length, previous.scoring.dimensions.length);
  assert.deepEqual(deep.dimensions.map(item => item.percent), base.dimensions.map(item => item.percent));
  assert.equal(deep.sections[0].content, previous.reports[0].description);
  assert.deepEqual(deep.actions, previous.reports[0].actions);
  assert.ok(unlocked.premiumUnlockedAt);
  assert.deepEqual(unlocked, untouched);
  assert.deepEqual(archive.getRecord(saved.id), untouched);
});

test('unknown or invalid versions cannot fall through to current profile rules', () => {
  const { current } = versions();
  const record = recordFor(current, 1);
  for (const testVersion of ['future', '3', 'toString', 'constructor', 2, {}]) {
    const unknown = { ...record, testVersion };
    assert.equal(resolveProfileVersion(current, testVersion), null);
    assert.equal(resolveReport(current, unknown), null);
    assert.equal(buildDeepReport(current, unknown, current.reports[2]), null);
  }
});

test('same-version retained records remain comparable while cross-version records do not compare', () => {
  const { previous, current } = versions();
  const before = recordFor(previous, 1);
  const after = recordFor(previous, 3);
  const comparison = buildComparison(current, after, before);
  assert.ok(comparison);
  assert.equal(comparison.changes.length, 3);
  assert.ok(comparison.changes.every(item => item.delta === 67));
  assert.equal(buildComparison(current, recordFor(current, 3), before), null);
});

test('retained configuration must belong to the same test ID and exact historical version', () => {
  const { previous, current } = versions();
  const config = {
    id: current.id, testVersion: '2', questions: current.questions,
    dimensionMeta: current.scoring.dimensionMeta,
    profiles: current.reports.map((report, index) => ({ ...report, vector: current.scoring.profiles[index].vector }))
  };
  assert.throws(() => createProfileTest({ ...config, retainedVersions: { '1': { ...previous, id: 'another-test' } } }));
  assert.throws(() => createProfileTest({ ...config, retainedVersions: { 'old': previous } }));
  assert.throws(() => createProfileTest({ ...config, retainedVersions: { '2': current } }));
});

test('all six real historical reports remain readable and twelve current identities carry distinct portraits', () => {
  const current = require('../data/tests/historical-echo.js').default;
  const previous = resolveProfileVersion(current, '1');
  assert.equal(current.testVersion, '2');
  assert.equal(previous.reports.length, 6);
  assert.equal(current.reports.length, 12);
  assert.equal(new Set(current.reports.map(report => report.portrait.id)).size, 12);
  for (const profile of previous.scoring.profiles) {
    const scores = Object.fromEntries(previous.scoring.dimensions.map(id => [id, 3 + Math.round(profile.vector[id] * 9 / 100)]));
    const resultType = previous.scoring.resultRule(scores);
    assert.equal(resultType, profile.type);
    const record = { testId: current.id, testVersion: '1', scoringVersion: '2', scores, resultType };
    const report = resolveReport(current, record);
    assert.equal(report.title, previous.reports.find(item => item.type === resultType).title);
    assert.equal(report.portrait.id, resultType);
    assert.equal(buildDeepReport(current, record, report).dimensions.length, 4);
  }
});
