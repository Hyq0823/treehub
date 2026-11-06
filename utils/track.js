// 第一版本地记录探索事件，不发送测评结果到远程分析服务。
const EVENTS = {
  HALL_VIEW: 'hall_view',
  DETAIL_VIEW: 'detail_view',
  TEST_START: 'test_start',
  TEST_ABORT: 'test_abort',
  TEST_SUBMIT: 'test_submit',
  RESULT_VIEW: 'result_view',
  RESULT_VIEW_FOREIGN: 'result_view_foreign',
  SHARE_TAP: 'share_tap',
  PREMIUM_AD_START: 'premium_ad_start',
  PREMIUM_UNLOCK: 'premium_unlock'
};

const LOG_KEY = 'trackLog';
const MAX_LOG = 100;
const FLUSH_DELAY = 300;
const FLUSH_BATCH = 20;
let cachedLog = null;
let pending = [];
let flushTimer = null;

function scheduleFlush() {
  if (flushTimer || !pending.length) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLocal();
  }, FLUSH_DELAY);
  // Node tests and development scripts should not stay alive for diagnostic logs.
  if (flushTimer && typeof flushTimer.unref === 'function') flushTimer.unref();
}

function readLocal() {
  if (cachedLog) return cachedLog;
  const saved = wx.getStorageSync(LOG_KEY);
  cachedLog = Array.isArray(saved) ? saved.slice(-MAX_LOG) : [];
  return cachedLog;
}

function flushLocal() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  try {
    cachedLog = readLocal().concat(batch).slice(-MAX_LOG);
    wx.setStorageSync(LOG_KEY, cachedLog);
  } catch (err) {
    // Diagnostics must never block the assessment flow. Retry only after a new
    // event instead of spinning while device storage is unavailable.
    cachedLog = null;
  }
}

function appendLocal(eventId, params, scene) {
  pending.push({ e: eventId, p: params, s: scene, t: Date.now() });
  if (pending.length >= FLUSH_BATCH) flushLocal();
  else scheduleFlush();
}

function report(eventId, params) {
  let scene = 0;
  try {
    const app = getApp();
    scene = app && app.globalData.enterScene || 0;
  } catch (error) {}
  const payload = { enterScene: scene };
  // Product counts need neither individual choices nor personality/result IDs.
  ['testId', 'reachedIndex', 'totalCount', 'unanswered'].forEach(key => {
    if (params && params[key] !== undefined) payload[key] = params[key];
  });
  appendLocal(eventId, payload, scene);
}

function resetLocalBuffer() {
  if (flushTimer) clearTimeout(flushTimer);
  cachedLog = null;
  pending = [];
  flushTimer = null;
}

module.exports = { EVENTS, report, flushLocal, resetLocalBuffer, resetForTests: resetLocalBuffer };
