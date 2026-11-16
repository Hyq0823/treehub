const { getContext } = require('./life-context.js');
const { SCORING_VERSION, TEST_VERSION } = require('./scoring.js');

// Raw choices remain on this device. This key is deliberately absent from the
// cloud summary, analytics and sharing paths.
const STORAGE_KEY = 'personalityTreeAnswerDrafts.v1';
const MAX_DRAFTS = 20;
const MAX_QUESTIONS = 200;
const MAX_DRAFT_BYTES = 16000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const signatures = new WeakMap();
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validSession = value => typeof value === 'string' && /^draft-[a-z0-9]+-[a-z0-9]+$/.test(value) && value.length <= 96;

function storageError() {
  return new Error('本机进度暂未保存，请检查存储空间；当前答案仍在页面中。');
}

function readStore() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return [];
  let value;
  try { value = wx.getStorageSync(STORAGE_KEY); }
  catch (error) { throw storageError(); }
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.drafts) || value.drafts.length > MAX_DRAFTS) return [];
  return value.drafts;
}

function writeStore(drafts) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') throw storageError();
  try { wx.setStorageSync(STORAGE_KEY, { schemaVersion: 1, drafts }); }
  catch (error) { throw storageError(); }
}

function signatureFor(test) {
  if (signatures.has(test)) return signatures.get(test);
  const source = JSON.stringify(test.questions);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const signature = (hash >>> 0).toString(16);
  signatures.set(test, signature);
  return signature;
}

function createSessionId() {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14) || '0'}`;
}

function validateDraft(test, draft, now = Date.now()) {
  if (!test || !Array.isArray(test.questions) || !test.questions.length || test.questions.length > MAX_QUESTIONS ||
      !object(draft) || draft.status !== 'answering' || !validSession(draft.sessionId) ||
      draft.testId !== test.id || String(draft.testVersion) !== String(test.testVersion || TEST_VERSION) ||
      draft.scoringVersion !== SCORING_VERSION || draft.questionSignature !== signatureFor(test) ||
      !getContext(draft.lifeContext) || !Array.isArray(draft.questionOrder) || !Array.isArray(draft.answers) ||
      draft.questionOrder.length !== test.questions.length || draft.answers.length !== test.questions.length ||
      !Number.isInteger(draft.currentQuestionIndex) || draft.currentQuestionIndex < 0 || draft.currentQuestionIndex >= test.questions.length) return null;
  const updated = Date.parse(draft.updatedAt);
  if (!Number.isFinite(updated) || now - updated > MAX_AGE_MS || updated > now + 5 * 60 * 1000) return null;
  const questionsById = new Map(test.questions.map(question => [String(question.id), question]));
  if (questionsById.size !== test.questions.length || new Set(draft.questionOrder).size !== test.questions.length) return null;
  let answeredCount = 0, selectedCount = 0;
  for (let index = 0; index < draft.questionOrder.length; index++) {
    const question = questionsById.get(draft.questionOrder[index]);
    const answer = draft.answers[index];
    if (!question || !Array.isArray(question.options) || !question.options.length || question.options.length > 20) return null;
    if (question.type === 'ranking') {
      if (!Array.isArray(answer) || answer.length > question.options.length || new Set(answer).size !== answer.length ||
          answer.some(value => !Number.isInteger(value) || value < 0 || value >= question.options.length)) return null;
      if (answer.length === question.options.length) answeredCount++;
      selectedCount += answer.length;
    } else {
      if (!Number.isInteger(answer) || answer < -1 || answer >= question.options.length) return null;
      if (answer !== -1) { answeredCount++; selectedCount++; }
    }
  }
  if (!selectedCount) return null;
  const result = clone(draft);
  result.answeredCount = answeredCount;
  result.selectedCount = selectedCount;
  result.allAnswered = answeredCount === test.questions.length;
  return result;
}

function getDraft(test, completedRecords = []) {
  const stored = readStore().find(item => object(item) && item.testId === test.id);
  const draft = validateDraft(test, stored);
  // If cleanup failed after a report was stored, its local session receipt
  // prevents the old choices from being offered as another unfinished test.
  if (!draft || completedRecords.some(record => record.answerSessionId === draft.sessionId)) return null;
  return draft;
}

function hasPendingDraft(testId, completedRecords = []) {
  if (typeof testId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(testId)) return false;
  return !!readDraftSummary(completedRecords, testId);
}

function getLatestDraftSummary(completedRecords = []) { return readDraftSummary(completedRecords); }

function readDraftSummary(completedRecords, requestedTestId) {
  try {
    const manifest = require('../data/draft-manifest.js');
    const { catalog } = require('../data/test-catalog.js');
    const known = new Map(catalog.map(test => [test.id, test]));
    const completed = new Set((Array.isArray(completedRecords) ? completedRecords : []).map(record => record && record.answerSessionId).filter(validSession));
    const now = Date.now();
    let latest = null;
    for (const draft of readStore()) {
      if (requestedTestId && (!object(draft) || draft.testId !== requestedTestId)) continue;
      const test = object(draft) && known.get(draft.testId);
      const meta = test && manifest[test.id];
      if (!meta || draft.status !== 'answering' || !validSession(draft.sessionId) || completed.has(draft.sessionId) ||
          String(draft.testVersion) !== meta.testVersion || draft.scoringVersion !== SCORING_VERSION ||
          draft.questionSignature !== meta.questionSignature || !getContext(draft.lifeContext) ||
          !Array.isArray(draft.answers) || !Array.isArray(draft.questionOrder) ||
          draft.answers.length !== meta.questions.length || draft.questionOrder.length !== meta.questions.length ||
          new Set(draft.questionOrder).size !== meta.questions.length ||
          !Number.isInteger(draft.currentQuestionIndex) || draft.currentQuestionIndex < 0 || draft.currentQuestionIndex >= meta.questions.length ||
          JSON.stringify(draft).length > MAX_DRAFT_BYTES) continue;
      const updated = Date.parse(draft.updatedAt);
      if (!Number.isFinite(updated) || now - updated > MAX_AGE_MS || updated > now + 5 * 60 * 1000) continue;
      const shapes = new Map(meta.questions.map(item => [item[0], item]));
      let answeredCount = 0, selectedCount = 0, valid = true;
      for (let index = 0; index < draft.questionOrder.length; index++) {
        const shape = shapes.get(draft.questionOrder[index]), answer = draft.answers[index];
        if (!shape) { valid = false; break; }
        if (shape[2]) {
          if (!Array.isArray(answer) || answer.length > shape[1] || new Set(answer).size !== answer.length ||
              answer.some(value => !Number.isInteger(value) || value < 0 || value >= shape[1])) { valid = false; break; }
          if (answer.length === shape[1]) answeredCount++;
          selectedCount += answer.length;
        } else {
          if (!Number.isInteger(answer) || answer < -1 || answer >= shape[1]) { valid = false; break; }
          if (answer !== -1) { answeredCount++; selectedCount++; }
        }
      }
      if (!valid || !selectedCount || latest && updated <= Date.parse(latest.updatedAt)) continue;
      const ranking = meta.questions.some(item => !!item[2]);
      const totalSelections = meta.questions.reduce((sum, item) => sum + (item[2] ? item[1] : 1), 0);
      latest = {
        testId: test.id, name: test.name, answeredCount, totalCount: meta.questions.length, selectedCount,
        allAnswered: answeredCount === meta.questions.length,
        ranking, progressPercent: Math.round(selectedCount / totalSelections * 100), updatedAt: draft.updatedAt
      };
    }
    return latest;
  } catch (error) { return null; } // Starting a new exploration never depends on a readable draft.
}

function removeDraft(testId, sessionId) {
  const stored = readStore();
  const remaining = stored.filter(item => !object(item) || item.testId !== testId || sessionId && item.sessionId !== sessionId);
  if (remaining.length !== stored.length) writeStore(remaining);
}

function saveDraft(test, state) {
  const snapshot = {
    status: 'answering', sessionId: state.sessionId, testId: test.id,
    testVersion: String(test.testVersion || TEST_VERSION), scoringVersion: SCORING_VERSION,
    questionSignature: signatureFor(test),
    questionOrder: state.questionOrder.slice(), answers: clone(state.answers),
    currentQuestionIndex: state.currentQuestionIndex, lifeContext: state.lifeContext || 'ordinary',
    updatedAt: new Date().toISOString()
  };
  const validated = validateDraft(test, snapshot);
  if (!validated) {
    const empty = snapshot.answers.every(answer => answer === -1 || Array.isArray(answer) && !answer.length);
    if (empty) { removeDraft(test.id, state.sessionId); return null; }
    throw new Error('作答进度有变化，请继续完成本次测试后查看报告。');
  }
  if (JSON.stringify(snapshot).length > MAX_DRAFT_BYTES) throw storageError();
  const recent = readStore().filter(item => object(item) && item.testId !== test.id && validSession(item.sessionId) &&
    Number.isFinite(Date.parse(item.updatedAt)) && Date.now() - Date.parse(item.updatedAt) <= MAX_AGE_MS &&
    JSON.stringify(item).length <= MAX_DRAFT_BYTES);
  recent.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  writeStore([snapshot, ...recent.slice(0, MAX_DRAFTS - 1)]);
  return validated;
}

module.exports = { STORAGE_KEY, MAX_DRAFTS, MAX_DRAFT_BYTES, MAX_AGE_MS, createSessionId, getDraft, hasPendingDraft, getLatestDraftSummary, saveDraft, removeDraft };
