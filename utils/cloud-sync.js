const cloudConfig = require('../config/cloud.js');
const archive = require('./archive.js');

const STATE_KEY = 'personalityTreeCloudSync.v1';
const PUSH_BATCH_SIZE = 20;
const PULL_PAGE_SIZE = 100;
let initialized = false;
let inFlight = null;
let syncTimer = null;
let rerunRequested = false;

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
    if (stored && stored.schemaVersion === 1) return stored;
  } catch (error) {}
  return { schemaVersion: 1, state: 'idle', lastSyncedAt: '', message: '云端备份已开启' };
}

function writeState(update) {
  const next = Object.assign({}, readState(), update, { schemaVersion: 1 });
  try { wx.setStorageSync(STATE_KEY, next); } catch (error) {}
  return clone(next);
}

function getStatus() {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return { schemaVersion: 1, state: 'unavailable', lastSyncedAt: '', message: '当前微信版本暂不支持云端同步' };
  }
  return clone(readState());
}

function initialize() {
  if (initialized) return true;
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.init || !wx.cloud.callFunction) {
    writeState({ state: 'unavailable', message: '当前微信版本暂不支持云端同步' });
    return false;
  }
  wx.cloud.init({ env: cloudConfig.environmentId, traceUser: true });
  initialized = true;
  return true;
}

async function callApi(action, data) {
  const response = await wx.cloud.callFunction({
    name: cloudConfig.functionName,
    data: Object.assign({ action, clientSchemaVersion: cloudConfig.schemaVersion }, data || {})
  });
  const result = response && response.result;
  if (!result || result.ok !== true) {
    throw new Error(result && result.message || '云端服务暂时不可用');
  }
  return result;
}

async function runSync() {
  if (!initialize()) return getStatus();
  writeState({ state: 'syncing', message: '正在同步测评档案…' });
  try {
    const local = archive.getArchive();
    const previous = readState();
    const uploaded = previous.uploaded && typeof previous.uploaded === 'object' ? previous.uploaded : {};
    const pending = local.records.filter(record => uploaded[record.id] !== fingerprint(record));
    for (let index = 0; index < pending.length; index += PUSH_BATCH_SIZE) {
      await callApi('syncArchive', {
        operation: 'push', seed: local.seed,
        records: pending.slice(index, index + PUSH_BATCH_SIZE)
      });
    }
    if (!pending.length && !previous.lastSyncedAt) {
      await callApi('syncArchive', { operation: 'push', seed: local.seed, records: [] });
    }

    const remoteRecords = [];
    let offset = 0;
    let userSeed = local.seed;
    let hasMore = true;
    while (hasMore) {
      const page = await callApi('syncArchive', {
        operation: 'pull', offset, limit: PULL_PAGE_SIZE
      });
      if (page.userSeed) userSeed = page.userSeed;
      if (Array.isArray(page.records)) remoteRecords.push(...page.records);
      hasMore = page.hasMore === true;
      offset = Number.isInteger(page.nextOffset) ? page.nextOffset : remoteRecords.length;
      if (hasMore && (!page.records || !page.records.length)) throw new Error('云端分页数据异常');
    }
    const merged = archive.mergeCloudArchive({ seed: userSeed, records: remoteRecords });
    const fingerprints = {};
    merged.records.forEach(record => { fingerprints[record.id] = fingerprint(record); });
    return writeState({
      state: 'synced', lastSyncedAt: new Date().toISOString(),
      message: '测评记录已备份到微信云端', lastError: '', uploaded: fingerprints
    });
  } catch (error) {
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
  try {
    if (initialize()) schedule(0);
  } catch (error) {
    writeState({ state: 'pending', message: '云端初始化失败，本地记录已安全保留', lastError: error.message || '' });
  }
}

module.exports = { STATE_KEY, start, schedule, syncArchive, getStatus };
