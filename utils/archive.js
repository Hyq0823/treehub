const { getTree } = require('./personality-tree.js');
const testsModule = require('../data/tests/index.js');
const catalog = testsModule.default || testsModule;

const STORAGE_KEY = 'personalityTreeArchive.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const finiteScores = scores => plainObject(scores) && Object.keys(scores).every(key => Number.isFinite(scores[key]));
const validType = value => typeof value === 'string' && value.length > 0 || finiteScores(value) && Object.keys(value).length > 0;

function storageError(message) {
  const error = new Error(message);
  error.name = 'ArchiveError';
  return error;
}
function read(key) {
  try { return wx.getStorageSync(key); }
  catch (error) { throw storageError('读取本地档案失败，请稍后重试。原有记录未被覆盖。'); }
}
function write(value) {
  try { wx.setStorageSync(STORAGE_KEY, value); }
  catch (error) { throw storageError('本地档案保存失败，请检查设备存储空间后重试。'); }
}
function requestCloudSync() {
  try { require('./cloud-sync.js').schedule(); } catch (error) {}
}
function recordIsValid(record) {
  return plainObject(record) && typeof record.id === 'string' && !!record.id &&
    typeof record.testId === 'string' && !!record.testId &&
    typeof record.completedAt === 'string' && Number.isFinite(Date.parse(record.completedAt)) &&
    (record.premiumUnlockedAt === undefined ||
      typeof record.premiumUnlockedAt === 'string' && Number.isFinite(Date.parse(record.premiumUnlockedAt))) &&
    finiteScores(record.scores) && validType(record.resultType);
}
function validateArchive(archive) {
  if (!plainObject(archive) || archive.schemaVersion !== 1 || typeof archive.seed !== 'string' || !archive.seed || !Array.isArray(archive.records) || !archive.records.every(recordIsValid)) {
    throw storageError('本地档案格式异常，已停止写入以保护原有记录。');
  }
  if (new Set(archive.records.map(record => record.id)).size !== archive.records.length) {
    throw storageError('本地档案记录异常，已停止写入以保护原有记录。');
  }
}
function makeSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;
}
function getArchive() {
  const stored = read(STORAGE_KEY);
  if (stored !== '' && stored !== undefined) {
    validateArchive(stored);
    return clone(stored);
  }
  const archive = { schemaVersion: 1, seed: makeSeed(), records: [] };
  const legacy = read('testResult');
  // Migration preserves the original key. Invalid old results remain there and
  // are never presented as a valid new assessment or used for personality matching.
  if (plainObject(legacy) && catalog.some(test => test.id === legacy.testId) && finiteScores(legacy.scores) && validType(legacy.resultType)) {
    const record = {
      id: `legacy-${archive.seed}`,
      testId: legacy.testId,
      testVersion: 'legacy',
      scoringVersion: 'legacy',
      scores: clone(legacy.scores),
      resultType: clone(legacy.resultType),
      completedAt: new Date().toISOString(),
      migrated: true
    };
    archive.records.push(record);
    record.treeSnapshot = getTree(archive, catalog);
  }
  archive.legacyChecked = true;
  write(archive);
  return clone(archive);
}
function validateAnswers(input, test) {
  if (input.answers === undefined) return;
  const answers = input.answers;
  if (!Array.isArray(answers) || answers.length !== test.questions.length) {
    throw storageError('答题记录不完整，无法保存到档案。');
  }
  // New assessments store canonical IDs so shuffled SBTI answers remain usable.
  if (answers.every(answer => Number.isInteger(answer))) {
    if (answers.some((answer, index) => answer < 0 || !test.questions[index].options[answer])) {
      throw storageError('答题记录不完整，无法保存到档案。');
    }
    return;
  }
  const seen = new Set();
  const valid = answers.every(answer => {
    if (!plainObject(answer) || !Number.isInteger(answer.optionIndex) || answer.optionIndex < 0) return false;
    const key = String(answer.questionId);
    const question = test.questions.find(item => String(item.id) === key);
    if (!question || seen.has(key) || !question.options[answer.optionIndex]) return false;
    seen.add(key);
    return true;
  });
  if (!valid) throw storageError('答题记录不完整，无法保存到档案。');
}
function saveResult(input) {
  if (!plainObject(input) || !catalog.some(test => test.id === input.testId) || !finiteScores(input.scores) || !validType(input.resultType)) {
    throw storageError('测评结果不完整，无法保存到档案。');
  }
  validateAnswers(input, catalog.find(test => test.id === input.testId));
  const archive = getArchive();
  const completedAt = new Date().toISOString();
  const record = {
    id: `assessment-${archive.seed}-${Date.now().toString(36)}-${archive.records.length.toString(36)}`,
    testId: input.testId,
    testVersion: input.testVersion || '1',
    scoringVersion: input.scoringVersion || '2',
    scores: clone(input.scores),
    resultType: clone(input.resultType),
    completedAt
  };
  if (Array.isArray(input.answers)) {
    record.answers = clone(input.answers);
  }
  archive.records.unshift(record);
  record.treeSnapshot = getTree(archive, catalog);
  write(archive);
  requestCloudSync();
  return clone(record);
}
function getRecords(testId) {
  return getArchive().records.filter(record => !testId || record.testId === testId);
}
function getLatest(testId) { return getRecords(testId)[0] || null; }
function getRecord(recordId) { return getArchive().records.find(record => record.id === recordId) || null; }

function unlockPremium(recordId) {
  if (typeof recordId !== 'string' || !recordId) {
    throw storageError('没有找到要解锁的测评报告。');
  }
  const archive = getArchive();
  const record = archive.records.find(item => item.id === recordId);
  if (!record) throw storageError('这份测评记录不在当前设备。');
  if (!record.premiumUnlockedAt) {
    record.premiumUnlockedAt = new Date().toISOString();
    write(archive);
    requestCloudSync();
  }
  return clone(record);
}

function clearLocalArchive() {
  // The caller must stop cloud backup first, so remote data cannot refill it.
  try {
    for (const key of [STORAGE_KEY, 'testResult', 'trackLog']) wx.removeStorageSync(key);
  } catch (error) {
    throw storageError('本机记录未能全部清除，请稍后重试。');
  }
}

function mergeCloudArchive(remote) {
  if (!plainObject(remote) || typeof remote.seed !== 'string' || !remote.seed || !Array.isArray(remote.records) ||
      !remote.records.every(recordIsValid)) {
    throw storageError('云端档案格式异常，本地记录未被修改。');
  }
  const archive = getArchive();
  const merged = new Map(archive.records.map(record => [record.id, clone(record)]));
  remote.records.forEach(record => {
    const existing = merged.get(record.id);
    if (!existing) {
      merged.set(record.id, clone(record));
      return;
    }
    if (record.premiumUnlockedAt && (!existing.premiumUnlockedAt ||
        Date.parse(record.premiumUnlockedAt) < Date.parse(existing.premiumUnlockedAt))) {
      existing.premiumUnlockedAt = record.premiumUnlockedAt;
    }
  });
  const next = Object.assign({}, archive, {
    seed: remote.seed,
    records: Array.from(merged.values()).sort((first, second) => {
      const time = Date.parse(second.completedAt) - Date.parse(first.completedAt);
      return time || first.id.localeCompare(second.id);
    })
  });
  // Cloud backup intentionally excludes visual snapshots and raw answers. A new
  // device can still rebuild a labelled growth view from the summaries it owns.
  // Use at most one historical result per test to avoid quadratic work.
  const historicalLatest = {};
  for (let index = next.records.length - 1; index >= 0; index--) {
    const record = next.records[index];
    historicalLatest[record.testId] = record;
    if (!record.treeSnapshot) {
      record.treeSnapshot = getTree({ seed: next.seed, records: Object.values(historicalLatest) }, catalog);
      record.treeSnapshot.totalCount = next.records.length - index;
      record.treeSnapshot.restoredFromSummary = true;
    }
  }
  validateArchive(next);
  if (JSON.stringify(next) !== JSON.stringify(archive)) write(next);
  return clone(next);
}

module.exports = {
  STORAGE_KEY, getArchive, saveResult, getRecords, getLatest, getRecord, unlockPremium, mergeCloudArchive, clearLocalArchive
};
