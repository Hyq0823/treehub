const { THEMES, getTheme } = require('../data/themes.js');

const STORAGE_KEY = 'personalityTreeThemes.v1';
const PENDING_KEY = 'personalityTreeThemePending.v1';
const pending = new Map();
const copy = value => JSON.parse(JSON.stringify(value));
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validGrant = grant => grant && !!getTheme(grant.themeId) && validDate(grant.unlockedAt) &&
  (grant.source === 'rewarded-video' || grant.source === 'starter' && getTheme(grant.themeId).starter === true);
const EMPTY = () => ({ version: 1, selectedId: 'adventurer', starterClaimed: false, unlocked: [] });

function read() {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (stored === '' || stored === undefined) return EMPTY();
  if (!stored || stored.version !== 1 || !getTheme(stored.selectedId) || typeof stored.starterClaimed !== 'boolean' || !Array.isArray(stored.unlocked) || !stored.unlocked.every(validGrant) || new Set(stored.unlocked.map(item => item.themeId)).size !== stored.unlocked.length) {
    throw new Error('主题收藏暂时无法读取，已有收藏未被覆盖。');
  }
  return copy(stored);
}
function write(state) {
  try { wx.setStorageSync(STORAGE_KEY, state); }
  catch (error) { throw new Error('主题尚未保存，请恢复设备存储空间后重试，无需重看视频。'); }
}
function schedule() { try { require('./cloud-sync.js').schedule(); } catch (error) {} }
function recordsOrLocal(records) { return records || require('./archive.js').getRecords(); }
function uniqueTests(records) {
  const module = require('../data/tests/index.js');
  const ids = new Set((module.default || module).map(test => test.id));
  return new Set(recordsOrLocal(records).filter(record => ids.has(record.testId) && record.scoringVersion === '2' && !record.migrated).map(record => record.testId)).size;
}
function recommendedTheme(records) {
  const latest = {};
  recordsOrLocal(records).filter(record => record.scoringVersion === '2' && !record.migrated).forEach(record => { if (!latest[record.testId]) latest[record.testId] = record; });
  const mbti = latest.mbti && latest.mbti.resultType;
  if (typeof mbti === 'string' && /^[EI][SN][TF][JP]$/.test(mbti)) {
    if (mbti[0] === 'I' && mbti[2] === 'F') return 'romantic';
    if (mbti[0] === 'I' && mbti[2] === 'T') return 'observer';
    if (mbti[1] === 'N' && mbti[3] === 'P') return 'dreamer';
    if (mbti[2] === 'F') return 'listener';
    return 'wanderer';
  }
  if (latest.ie && latest.ie.resultType === 'I') return 'moon';
  if (latest.enneagram && latest.enneagram.resultType === '4') return 'romantic';
  return 'adventurer';
}
function getState(records) {
  const state = read();
  const source = recordsOrLocal(records);
  const uniqueCount = uniqueTests(source);
  const catalogModule = require('../data/tests/index.js');
  const catalogCount = (catalogModule.default || catalogModule).length;
  const recommendation = recommendedTheme(source);
  const owned = new Set(state.unlocked.map(grant => grant.themeId));
  return Object.assign(state, {
    uniqueCount, catalogCount, recommendation,
    catalog: THEMES.map(theme => Object.assign(copy(theme), {
      unlocked: owned.has(theme.id), discovered: owned.has(theme.id) || !theme.hidden || uniqueCount >= theme.requiredTests,
      recommended: recommendation === theme.id, selected: state.selectedId === theme.id,
      pending: !!getPendingGrant(theme.id)
    }))
  });
}
function ensureDiscoverable(themeId, records) {
  const theme = getTheme(themeId);
  if (!theme) throw new Error('没有找到这套主题。');
  if (theme.hidden && uniqueTests(records) < theme.requiredTests) throw new Error(`完成 ${theme.requiredTests} 类不同测试后，会发现这套隐藏主题。`);
  return theme;
}
function claimStarter(themeId, records) {
  const theme = ensureDiscoverable(themeId, records);
  const state = read();
  if (state.unlocked.some(grant => grant.themeId === themeId)) return selectTheme(themeId, records);
  if (!theme.starter || state.starterClaimed) throw new Error('基础主题已领取，其他主题可通过完整观看视频解锁。');
  if (uniqueTests(records) < 1) throw new Error('完成第一次测试，就能领取专属的树与伙伴。');
  state.unlocked.push({ themeId, unlockedAt: new Date().toISOString(), source: 'starter' });
  state.selectedId = themeId;
  state.starterClaimed = true;
  write(state); schedule();
  return getState(records);
}
function selectTheme(themeId, records) {
  const state = read();
  if (!state.unlocked.some(grant => grant.themeId === themeId)) throw new Error('先解锁这套主题，再邀请伙伴住进你的树。');
  state.selectedId = themeId;
  write(state); schedule();
  return getState(records);
}
function readPending() {
  try {
    const saved = wx.getStorageSync(PENDING_KEY);
    if (saved === '' || saved === undefined) return true;
    if (!saved || saved.version !== 1 || !Array.isArray(saved.grants) || !saved.grants.every(grant => getTheme(grant.themeId) && validDate(grant.completedAt))) return false;
    saved.grants.forEach(grant => { if (!pending.has(grant.themeId)) pending.set(grant.themeId, copy(grant)); });
    return true;
  } catch (error) { return false; }
}
function writePending() {
  try { wx.setStorageSync(PENDING_KEY, { version: 1, grants: Array.from(pending.values()) }); } catch (error) {}
}
function getPendingGrant(themeId) {
  readPending();
  return pending.has(themeId) ? copy(pending.get(themeId)) : null;
}
function rememberCompletedGrant(themeId, records) {
  ensureDiscoverable(themeId, records);
  const readable = readPending();
  if (!pending.has(themeId)) pending.set(themeId, { themeId, completedAt: new Date().toISOString() });
  if (readable) writePending();
  return copy(pending.get(themeId));
}
function persistPendingGrant(themeId, records) {
  ensureDiscoverable(themeId, records);
  const state = read();
  const receipt = getPendingGrant(themeId);
  if (!state.unlocked.some(grant => grant.themeId === themeId)) {
    if (!receipt) throw new Error('请先完整观看这套主题的解锁视频。');
    state.unlocked.push({ themeId, unlockedAt: receipt.completedAt, source: 'rewarded-video' });
  }
  state.selectedId = themeId;
  write(state);
  const readable = readPending();
  pending.delete(themeId);
  if (readable) writePending();
  schedule();
  return getState(records);
}
function getSyncPayload() {
  const state = read();
  return { version: 1, selectedId: state.selectedId, starterClaimed: !!state.starterClaimed, unlocked: copy(state.unlocked) };
}
function mergeCloudState(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.unlocked) || !payload.unlocked.every(validGrant)) throw new Error('云端主题数据无效，本地收藏未被修改。');
  const state = read();
  const owned = new Map(state.unlocked.map(grant => [grant.themeId, grant]));
  payload.unlocked.forEach(grant => {
    const current = owned.get(grant.themeId);
    if (!current || Date.parse(grant.unlockedAt) < Date.parse(current.unlockedAt)) owned.set(grant.themeId, copy(grant));
  });
  state.unlocked = Array.from(owned.values());
  state.starterClaimed = state.starterClaimed || !!payload.starterClaimed || state.unlocked.some(grant => grant.source === 'starter');
  if (!state.unlocked.some(grant => grant.themeId === state.selectedId) && getTheme(payload.selectedId) && owned.has(payload.selectedId)) state.selectedId = payload.selectedId;
  write(state);
  return copy(state);
}
function clearLocalState() {
  pending.clear();
  wx.removeStorageSync(STORAGE_KEY);
  wx.removeStorageSync(PENDING_KEY);
}
module.exports = { STORAGE_KEY, PENDING_KEY, getState, claimStarter, selectTheme, rememberCompletedGrant, getPendingGrant, persistPendingGrant, unlockWithCompletedGrant: persistPendingGrant, getSyncPayload, mergeCloudState, clearLocalState, uniqueTests };
