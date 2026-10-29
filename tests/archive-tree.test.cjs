const test = require('node:test');
const assert = require('node:assert/strict');
const archive = require('../utils/archive.js');
const { getTree } = require('../utils/personality-tree.js');
const { STAGES } = require('../data/trees.js');
const catalogModule = require('../data/tests/index.js');
const catalog = catalogModule.default || catalogModule;
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
let storage;
function setup(values = {}) {
  storage = new Map(Object.entries(values));
  global.wx = {
    getStorageSync(key) { return clone(storage.get(key)); },
    setStorageSync(key, value) { storage.set(key, clone(value)); }
  };
}
function assessment(testId = 'mbti', resultType = 'INTJ', scores = { EI: -7, SN: -7, TF: 7, JP: 7 }) {
  return { testId, resultType, scores };
}

test('seed persists across reads and module reload; callers cannot mutate stored archive', () => {
  setup();
  const first = archive.getArchive();
  const second = archive.getArchive();
  assert.equal(first.seed, second.seed);
  first.seed = 'tampered';
  first.records.push({});
  delete require.cache[require.resolve('../utils/archive.js')];
  const reloaded = require('../utils/archive.js').getArchive();
  assert.equal(reloaded.seed, second.seed);
  assert.deepEqual(reloaded.records, []);
});

test('legacy result migrates once, preserves original, and does not supply personality evidence', () => {
  const old = { testId: 'mbti', scores: {}, resultType: 'INFP' };
  setup({ testResult: old });
  const migrated = archive.getArchive();
  assert.equal(migrated.records.length, 1);
  assert.equal(migrated.records[0].scoringVersion, 'legacy');
  assert.equal(migrated.records[0].migrated, true);
  assert.deepEqual(storage.get('testResult'), old);
  assert.equal(migrated.records[0].treeSnapshot.speciesId, 'seed');
  assert.equal(archive.getArchive().records.length, 1);
  assert.equal(getTree(migrated, catalog).uniqueCount, 1);
  assert.deepEqual(getTree(migrated, catalog).evidence, []);
});

test('invalid legacy data is retained but not migrated as a successful measurement', () => {
  const old = { testId: 'enneagram', scores: {}, resultType: '' };
  setup({ testResult: old });
  assert.deepEqual(archive.getArchive().records, []);
  assert.deepEqual(storage.get('testResult'), old);
});

test('same-test repeats retain every result, latest order and original tree snapshots', () => {
  setup();
  const first = archive.saveResult(assessment('mbti', 'INTJ'));
  const originalSnapshot = clone(first.treeSnapshot);
  const second = archive.saveResult(assessment('mbti', 'ENFP'));
  assert.notEqual(first.id, second.id);
  assert.equal(archive.getLatest('mbti').id, second.id);
  assert.deepEqual(archive.getRecords('mbti').map(record => record.id), [second.id, first.id]);
  assert.equal(second.treeSnapshot.uniqueCount, 1);
  assert.equal(second.treeSnapshot.totalCount, 2);
  assert.equal(second.treeSnapshot.stage.id, 'sprout');
  assert.deepEqual(archive.getRecord(first.id).treeSnapshot, originalSnapshot);
  first.scores.EI = 500;
  first.treeSnapshot.name = 'mutated';
  assert.notEqual(archive.getRecord(first.id).scores.EI, 500);
  assert.notEqual(archive.getRecord(first.id).treeSnapshot.name, 'mutated');
});

test('new test grows coverage while repeating it only adds history', () => {
  setup();
  archive.saveResult(assessment());
  archive.saveResult(assessment('ie', 'I', { EI: 1 }));
  const third = archive.saveResult(assessment('enneagram', '5', { '5': 12 }));
  assert.equal(third.treeSnapshot.stage.id, 'rooted');
  assert.equal(third.treeSnapshot.uniqueCount, 3);
  assert.equal(third.treeSnapshot.remaining, 2);
  const repeated = archive.saveResult(assessment('ie', 'I', { EI: 1 }));
  assert.equal(repeated.treeSnapshot.uniqueCount, 3);
  assert.equal(repeated.treeSnapshot.totalCount, 4);
});

test('corrupt archive and storage failures never silently overwrite or discard history', () => {
  setup({ [archive.STORAGE_KEY]: { schemaVersion: 99, records: [] } });
  const original = clone(storage.get(archive.STORAGE_KEY));
  assert.throws(() => archive.getArchive(), /格式异常/);
  assert.throws(() => archive.saveResult(assessment()), /格式异常/);
  assert.deepEqual(storage.get(archive.STORAGE_KEY), original);
  setup();
  archive.saveResult(assessment());
  const prior = clone(storage.get(archive.STORAGE_KEY));
  wx.setStorageSync = () => { throw new Error('quota'); };
  assert.throws(() => archive.saveResult(assessment('ie', 'E', { EI: 12 })), /保存失败/);
  assert.deepEqual(storage.get(archive.STORAGE_KEY), prior);
  wx.getStorageSync = () => { throw new Error('read denied'); };
  assert.throws(() => archive.getArchive(), /读取本地档案失败/);
});

test('save rejects incomplete results and unknown tests without changing archive', () => {
  setup();
  const before = archive.getArchive();
  assert.throws(() => archive.saveResult(assessment('unknown')), /测评结果不完整/);
  assert.throws(() => archive.saveResult(assessment('mbti', '')), /测评结果不完整/);
  assert.throws(() => archive.saveResult(assessment('mbti', 'INTJ', { EI: NaN })), /测评结果不完整/);
  assert.throws(() => archive.saveResult(Object.assign(assessment(), { answers: [-1] })), /答题记录不完整/);
  assert.deepEqual(archive.getArchive(), before);
});

test('species, variant and prose are deterministic for identical results and seed', () => {
  const base = { seed: 'device-a', records: [Object.assign(assessment(), { scoringVersion: '2' })] };
  const first = getTree(base, catalog);
  assert.deepEqual(getTree(clone(base), catalog), first);
  assert.equal(Number.isInteger(first.variant), true);
  assert.equal(first.speciesId, 'ginkgo');
  assert.equal(first.evidence.length, 1);
  const repeated = getTree({ seed: base.seed, records: base.records.concat(base.records) }, catalog);
  assert.equal(repeated.variant, first.variant);
  assert.equal(repeated.speciesId, first.speciesId);
});

test('different supported result patterns lead to different tree species', () => {
  function treeFor(testId, resultType, scores) {
    return getTree({ seed: 'same-device', records: [{ testId, resultType, scores, scoringVersion: '2' }] }, catalog);
  }
  assert.equal(treeFor('ie', 'I', { EI: 0 }).speciesId, 'ginkgo');
  assert.equal(treeFor('ie', 'E', { EI: 15 }).speciesId, 'banyan');
  assert.equal(treeFor('enneagram', '7', { '7': 15 }).speciesId, 'maple');
  assert.equal(treeFor('enneagram', '4', { '4': 15 }).speciesId, 'willow');
  assert.equal(treeFor('enneagram', '1', { '1': 15 }).speciesId, 'pine');
  assert.equal(treeFor('enneagram', '9', { '9': 15 }).speciesId, 'olive');
});

test('Big Five uses valid corrected dimensions, never neuroticism to rank tree quality', () => {
  const scores = { openness: 40, conscientiousness: 24, extraversion: 24, agreeableness: 24, neuroticism: 8 };
  const state = { seed: 'stable', records: [{ testId: 'bigfive', resultType: 'profile', scores, scoringVersion: '2' }] };
  assert.equal(getTree(state, catalog).speciesId, 'maple');
  state.records[0].scores.neuroticism = 40;
  assert.equal(getTree(state, catalog).speciesId, 'maple');
  state.records[0].scores.openness = 400;
  assert.equal(getTree(state, catalog).speciesId, 'seed');
});

test('SBTI, shadow and legacy records only add growth, not personality inference', () => {
  const state = { seed: 'stable', records: [
    { testId: 'sbti', resultType: 'BOSS', scores: {}, scoringVersion: '2' },
    { testId: 'shadow', resultType: 'high', scores: { shadow: 40 }, scoringVersion: '2' },
    { testId: 'mbti', resultType: 'ENTJ', scores: {}, scoringVersion: 'legacy' }
  ] };
  const tree = getTree(state, catalog);
  assert.equal(tree.speciesId, 'seed');
  assert.equal(tree.stage.id, 'rooted');
  assert.equal(tree.uniqueCount, 3);
  assert.deepEqual(tree.evidence, []);
});

test('all stages have exact thresholds, and next prompt never exceeds available tests', () => {
  const expandedCatalog = Array.from({ length: 40 }, (_, i) => ({ id: `test-${i}` }));
  STAGES.forEach(stage => {
    const records = expandedCatalog.slice(0, stage.threshold).map(item => ({ testId: item.id, scores: {}, resultType: 'done' }));
    const actual = getTree({ seed: 'stage', records }, expandedCatalog);
    assert.equal(actual.stage.id, stage.id);
    assert.equal(actual.uniqueCount, stage.threshold);
  });
  const complete = catalog.map(item => ({ testId: item.id, scores: {}, resultType: 'done' }));
  const tree = getTree({ seed: 'stage', records: complete }, catalog);
  assert.equal(tree.stage.id, 'growing');
  assert.equal(tree.nextStage, null);
  assert.equal(tree.remaining, 0);
  assert.equal(tree.progress, 100);
});


test('canonical shuffled answers persist question identity and reject duplicates/missing/options', () => {
  setup();
  const sbti = catalog.find(item => item.id === 'sbti');
  const answers = sbti.questions.slice().reverse().map(question => ({ questionId: question.id, optionIndex: 0 }));
  const saved = archive.saveResult({ testId: 'sbti', scores: {}, resultType: 'BOSS', answers });
  assert.deepEqual(saved.answers, answers);
  assert.deepEqual(archive.getRecord(saved.id).answers, answers);
  const previous = archive.getArchive();
  const repeated = answers.slice();
  repeated[0] = repeated[1];
  assert.throws(() => archive.saveResult({ testId: 'sbti', scores: {}, resultType: 'BOSS', answers: repeated }), /答题记录不完整/);
  const invalidOption = answers.map(answer => Object.assign({}, answer));
  invalidOption[0].optionIndex = 100;
  assert.throws(() => archive.saveResult({ testId: 'sbti', scores: {}, resultType: 'BOSS', answers: invalidOption }), /答题记录不完整/);
  assert.throws(() => archive.saveResult({ testId: 'sbti', scores: {}, resultType: 'BOSS', answers: answers.slice(1) }), /答题记录不完整/);
  assert.deepEqual(archive.getArchive(), previous);
});

test('real scoring output can be archived and resolved for every catalog test', () => {
  const { scoreTest, resolveReport } = require('../utils/scoring.js');
  setup();
  catalog.forEach(item => {
    const questions = item.questions.slice().reverse();
    const indices = questions.map(() => 0);
    const result = scoreTest(item, questions, indices);
    const saved = archive.saveResult(Object.assign({
      testId: item.id,
      answers: questions.map((question, index) => ({ questionId: question.id, optionIndex: indices[index] }))
    }, result));
    const report = resolveReport(item, archive.getRecord(saved.id));
    assert.ok(report && report.title, item.id + ' report resolves after storage');
    assert.equal(saved.treeSnapshot.uniqueCount, archive.getArchive().records.length);
  });
  assert.equal(archive.getArchive().records.length, catalog.length);
  assert.equal(getTree(archive.getArchive(), catalog).stage.id, 'growing');
});
