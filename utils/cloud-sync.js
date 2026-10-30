const cloudConfig = require('../config/cloud.js');
const archive = require('./archive.js');
const privacy = require('./privacy.js');

const STATE_KEY = 'personalityTreeCloudSync.v1';
const PUSH_BATCH_SIZE = 20;
const PULL_PAGE_SIZE = 100;
let initialized = false;
let inFlight = null;
let syncTimer = null;
let rerunRequested = false;
let activeConsentId = '';
let generation = 0;

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readState() {
  try {
    const stored = wx.getStorageSync(STATE_KEY);
    if (stored && stored.schemaVersion === 2) return stored;
  } catch (error) {}
  return { schemaVersion: 2, state: 'idle', lastSyncedAt: '', message: '云备份等待你的选择' };
}

function writeState(update) {
  const next = Object.assign({}, readState(), update, { schemaVersion: 2 });
  try { wx.setStorageSync(STATE_KEY, next); } catch (error) {}
  return clone(next);
}

function getStatus() {
  if (!privacy.isCloudBackupEnabled()) {
    const stored = readState();
    if (stored.state === 'delete_pending') return clone(stored);
    return Object.assign({}, stored, { state: 'disabled', message: '仅保存在本机，云备份未开启' });
  }
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return { schemaVersion: 2, state: 'unavailable', lastSyncedAt: '', message: '当前微信版本暂不支持云端同步' };
  }
  return clone(readState());
}

function initializePublicAssets() {
  if (initialized) return true;
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.init || !wx.cloud.callFunction) {
    writeState({ state: 'unavailable', message: '当前微信版本暂不支持云端同步' });
    return false;
  }
  // Loading public theme artwork never opts a person into assessment backup or tracking.
  wx.cloud.init({ env: cloudConfig.environmentId, traceUser: false });
  initialized = true;
  return true;
}

async function callApi(action, data) {
  const payload = Object.assign({ action, clientSchemaVersion: cloudConfig.schemaVersion }, data || {});
  Object.keys(payload).forEach(key => { if (payload[key] === undefined) delete payload[key]; });
  const response = await wx.cloud.callFunction({
    name: cloudConfig.functionName,
    data: payload
  });
  const result = response && response.result;
  if (!result || result.ok !== true) {
    throw new Error(result && result.message || '云端服务暂时不可用');
  }
  return result;
}

async function runSync() {
  const settings = privacy.getSettings();
  const consent = privacy.getCloudConsent();
  if (!consent || !initializePublicAssets()) return getStatus();
  const runGeneration = generation;
  const stillAllowed = () => {
    const current = privacy.getSettings();
    return runGeneration === generation && current.cloudBackup && current.revision === settings.revision && current.cloudConsentId === consent.id;
  };
  writeState({ state: 'syncing', message: '正在同步测评档案…' });
  try {
    const local = archive.getArchive();
    const themes = require('./themes.js');
    const themeState = themes.getSyncPayload();
    if (activeConsentId !== consent.id) {
      await callApi('authorizeBackup', { consent, seed: local.seed });
      if (!stillAllowed()) return getStatus();
      activeConsentId = consent.id;
    }
    const previous = readState();
    const uploaded = previous.uploaded && typeof previous.uploaded === 'object' ? previous.uploaded : {};
    const summaries = local.records.map(summaryRecord);
    const pending = summaries.filter(record => uploaded[record.id] !== fingerprint(record));
    for (let index = 0; index < pending.length; index += PUSH_BATCH_SIZE) {
      if (!stillAllowed()) return getStatus();
      await callApi('syncArchive', {
        operation: 'push', seed: local.seed, consentId: consent.id,
        records: pending.slice(index, index + PUSH_BATCH_SIZE),
        // Only send grants after all prerequisite result summaries have reached
        // the server, so hidden-theme validation also works with large histories.
        themeState: index + PUSH_BATCH_SIZE >= pending.length ? themeState : undefined
      });
    }
    if (!stillAllowed()) return getStatus();
    if (!pending.length && (!previous.lastSyncedAt || previous.themeFingerprint !== fingerprint(themeState))) {
      await callApi('syncArchive', { operation: 'push', seed: local.seed, consentId: consent.id, records: [], themeState });
    }

    const remoteRecords = [];
    let offset = 0;
    let userSeed = local.seed;
    let hasMore = true;
    let remoteThemeState = null;
    while (hasMore) {
      if (!stillAllowed()) return getStatus();
      const page = await callApi('syncArchive', {
        operation: 'pull', offset, limit: PULL_PAGE_SIZE, consentId: consent.id
      });
      if (!stillAllowed()) return getStatus();
      if (page.userSeed) userSeed = page.userSeed;
      if (page.themeState) remoteThemeState = page.themeState;
      if (Array.isArray(page.records)) remoteRecords.push(...page.records);
      hasMore = page.hasMore === true;
      offset = Number.isInteger(page.nextOffset) ? page.nextOffset : remoteRecords.length;
      if (hasMore && (!page.records || !page.records.length)) throw new Error('云端分页数据异常');
      if (offset > 100000) throw new Error('档案数量较多，请联系运营者协助导出。');
    }
    if (!stillAllowed()) return getStatus();
    const merged = archive.mergeCloudArchive({ seed: userSeed, records: remoteRecords });
    if (remoteThemeState) themes.mergeCloudState(remoteThemeState);
    const fingerprints = {};
    merged.records.forEach(record => { fingerprints[record.id] = fingerprint(summaryRecord(record)); });
    return writeState({
      state: 'synced', lastSyncedAt: new Date().toISOString(),
      message: '结果摘要与主题已备份，原始答案仅留在本机', lastError: '', uploaded: fingerprints,
      themeFingerprint: fingerprint(themes.getSyncPayload())
    });
  } catch (error) {
    if (!stillAllowed()) return getStatus();
    return writeState({
      state: 'pending', message: '云端暂未连接，本地记录已安全保留',
      lastError: error && error.message || '同步失败'
    });
  }
}

function syncArchive() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
    if (rerunRequested) {
      rerunRequested = false;
      schedule(100);
    }
  });
  return inFlight;
}

function schedule(delay = 800) {
  if (!privacy.isCloudBackupEnabled()) return;
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return;
  if (inFlight) {
    rerunRequested = true;
    return;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncArchive();
  }, delay);
}

function start() {
  if (!privacy.isCloudBackupEnabled()) return;
  try {
    if (initializePublicAssets()) schedule(0);
  } catch (error) {
    writeState({ state: 'pending', message: '云端初始化失败，本地记录已安全保留', lastError: error.message || '' });
  }
}

function summaryRecord(record) {
  const summary = {};
  ['id', 'testId', 'testVersion', 'scoringVersion', 'scores', 'resultType', 'completedAt', 'premiumUnlockedAt', 'migrated'].forEach(key => {
    if (record[key] !== undefined) summary[key] = clone(record[key]);
  });
  return summary;
}

function stop() {
  generation++;
  activeConsentId = '';
  rerunRequested = false;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
}

async function deleteCloudData() {
  privacy.revokeCloudBackup();
  stop();
  // A request already accepted by WeChat cannot be cancelled. Drain this client's
  // request before deleting; server-side revocation also blocks old device sessions.
  if (inFlight) await inFlight;
  if (!initializePublicAssets()) throw new Error('当前微信版本暂不支持云端删除，请更新微信后重试。');
  writeState({ state: 'deleting', message: '正在删除云端测评结果…' });
  try {
    const result = await callApi('deleteMyData');
    writeState({ state: 'disabled', uploaded: {}, lastSyncedAt: '', lastError: '', message: '云端测评结果和树种子已删除' });
    return result;
  } catch (error) {
    writeState({ state: 'delete_pending', message: '云备份已关闭，云端删除尚未完成，请联网后重试', lastError: error.message || '删除失败' });
    throw error;
  }
}

async function exportCloudData() {
  if (!initializePublicAssets()) throw new Error('当前微信版本暂不支持云端导出。');
  const records = [];
  let offset = 0;
  let userSeed = '';
  let hasMore = true;
  let themeState = null;
  while (hasMore) {
    const page = await callApi('exportMyData', { offset, limit: PULL_PAGE_SIZE });
    records.push(...(page.records || []).map(summaryRecord));
    userSeed = page.userSeed || userSeed;
    if (page.themeState) themeState = clone(page.themeState);
    hasMore = page.hasMore === true;
    if (hasMore && (!page.records || !page.records.length)) throw new Error('云端导出分页异常，请稍后重试。');
    offset = page.nextOffset;
    if (offset > 100000) throw new Error('档案数量较多，请联系运营者协助导出。');
  }
  return { schemaVersion: 1, seed: userSeed, records, themeState, exportedAt: new Date().toISOString() };
}

module.exports = {
  STATE_KEY, start, schedule, syncArchive, getStatus, stop,
  initializePublicAssets, deleteCloudData, exportCloudData, summaryRecord
};
