const policy = require('../config/privacy.js');

const SETTINGS_KEY = 'personalityTreePrivacy.v1';
const defaults = () => ({
  schemaVersion: 1, policyVersion: '', acceptedAt: '', cloudBackup: false,
  cloudConsentId: '', cloudAcceptedAt: '', revision: 0
});

function getSettings() {
  let stored;
  try { stored = wx.getStorageSync(SETTINGS_KEY); } catch (error) {}
  const valid = stored && stored.schemaVersion === 1 && typeof stored === 'object';
  const value = Object.assign(defaults(), valid ? stored : {});
  value.revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  value.policyAccepted = value.policyVersion === policy.policyVersion && typeof value.acceptedAt === 'string' && Number.isFinite(Date.parse(value.acceptedAt));
  value.cloudBackup = value.policyAccepted && value.cloudBackup === true && typeof value.cloudConsentId === 'string' &&
    /^[a-zA-Z0-9_-]{16,160}$/.test(value.cloudConsentId) && typeof value.cloudAcceptedAt === 'string' && Number.isFinite(Date.parse(value.cloudAcceptedAt));
  value.releaseReady = !!(policy.operatorName.trim() && (policy.contactEmail.trim() || policy.contactPhone.trim()));
  return value;
}

function save(update) {
  const value = Object.assign({}, getSettings(), update);
  delete value.policyAccepted;
  delete value.releaseReady;
  try { wx.setStorageSync(SETTINGS_KEY, value); }
  catch (error) { throw new Error('隐私选择暂时无法保存，请恢复设备存储后重试。'); }
  return getSettings();
}

function acceptPolicy() {
  const current = getSettings();
  return save({ policyVersion: policy.policyVersion, acceptedAt: new Date().toISOString(), revision: current.revision + 1 });
}

function setCloudBackup(enabled) {
  const current = getSettings();
  if (!enabled) return revokeCloudBackup();
  if (!current.policyAccepted) throw new Error('请先阅读并同意隐私政策，再选择是否开启云备份。');
  if (current.cloudBackup) return current;
  return save({
    cloudBackup: true,
    cloudConsentId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${Math.random().toString(36).slice(2, 14)}`,
    cloudAcceptedAt: new Date().toISOString(), revision: current.revision + 1
  });
}

function revokeCloudBackup() {
  const current = getSettings();
  // Keep the last consent ID until deletion is complete, so a failed deletion can be retried.
  return save({ cloudBackup: false, revision: current.revision + 1 });
}

function isCloudBackupEnabled() { return getSettings().cloudBackup; }
function getCloudConsent() {
  const settings = getSettings();
  if (!settings.cloudBackup) return null;
  return { id: settings.cloudConsentId, policyVersion: settings.policyVersion, acceptedAt: settings.cloudAcceptedAt };
}

function authorizeWeChatPrivacy() {
  return new Promise((resolve, reject) => {
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: resolve,
        fail: () => reject(new Error('未同意微信隐私保护指引，云备份没有开启。你仍可在本机完成测试。'))
      });
      return;
    }
    if (typeof wx.getPrivacySetting === 'function') {
      wx.getPrivacySetting({
        success: result => result.needAuthorization ? reject(new Error('请先同意微信隐私保护指引，或升级微信后重试。')) : resolve(result),
        fail: () => reject(new Error('暂时无法读取微信隐私授权状态，请稍后重试。'))
      });
      return;
    }
    reject(new Error('当前微信版本不支持隐私授权，请升级微信后开启云备份。本机测试仍可使用。'));
  });
}

module.exports = {
  SETTINGS_KEY, POLICY_CONFIG: policy, getSettings, acceptPolicy, setCloudBackup,
  revokeCloudBackup, isCloudBackupEnabled, getCloudConsent, authorizeWeChatPrivacy
};
