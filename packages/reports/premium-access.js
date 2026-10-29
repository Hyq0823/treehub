const archive = require('../../utils/archive.js');

// A small completion receipt can still fit when rewriting the full archive fails.
// Memory keeps the completed view available within this app session if storage is full.
const PENDING_KEY = 'personalityTreePremiumPending.v1';
const pending = new Map();

function readReceipts() {
  try {
    const stored = wx.getStorageSync(PENDING_KEY);
    if (stored === '' || stored === undefined) return true;
    if (!stored || stored.version !== 1 || !Array.isArray(stored.grants)) return false;
    for (const receipt of stored.grants) {
      if (!receipt || typeof receipt.recordId !== 'string' || !receipt.recordId ||
          typeof receipt.completedAt !== 'string' || !Number.isFinite(Date.parse(receipt.completedAt))) {
        return false;
      }
    }
    stored.grants.forEach(receipt => {
      if (!pending.has(receipt.recordId)) pending.set(receipt.recordId, Object.assign({}, receipt));
    });
    return true;
  } catch (error) {
    return false;
  }
}

function writeReceipts() {
  try {
    wx.setStorageSync(PENDING_KEY, { version: 1, grants: Array.from(pending.values()) });
  } catch (error) {
    // Never discard a completed view merely because storage is temporarily unavailable.
  }
}

function getPendingGrant(recordId) {
  readReceipts();
  const receipt = pending.get(recordId);
  return receipt ? Object.assign({}, receipt) : null;
}

function rememberCompletedGrant(recordId) {
  if (typeof recordId !== 'string' || !recordId) throw new Error('没有找到要解锁的测评报告。');
  const readable = readReceipts();
  if (!pending.has(recordId)) {
    pending.set(recordId, { recordId, completedAt: new Date().toISOString() });
  }
  if (readable) writeReceipts();
  return Object.assign({}, pending.get(recordId));
}

function persistPendingGrant(recordId) {
  const receipt = getPendingGrant(recordId);
  const existing = archive.getRecord(recordId);
  if (!existing) throw new Error('这份测评记录不在当前设备。');
  if (!receipt && !existing.premiumUnlockedAt) throw new Error('请先完整观看激励视频。');
  const updated = existing.premiumUnlockedAt ? existing : archive.unlockPremium(recordId);
  const readable = readReceipts();
  pending.delete(recordId);
  if (readable) writeReceipts();
  return updated;
}

module.exports = { PENDING_KEY, getPendingGrant, rememberCompletedGrant, persistPendingGrant };
