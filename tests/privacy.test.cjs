const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function fixture(overrides = {}) {
  const memory = new Map();
  const wx = Object.assign({
    getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, structuredClone(value))
  }, overrides);
  const file = path.resolve(__dirname, '../utils/privacy.js'), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, wx, require: createRequire(file) }, { filename: file });
  return { privacy: module.exports, memory, wx };
}

test('explicitly enabling optional backup creates a current consent in one step', () => {
  const { privacy } = fixture();
  assert.equal(privacy.getSettings().policyAccepted, false);
  assert.equal(privacy.isCloudBackupEnabled(), false);
  privacy.setCloudBackup(true);
  assert.equal(privacy.getSettings().policyAccepted, true);
  assert.equal(privacy.isCloudBackupEnabled(), true);
  assert.ok(privacy.getCloudConsent().id);
  const firstId = privacy.getCloudConsent().id;
  privacy.revokeCloudBackup();
  assert.equal(privacy.isCloudBackupEnabled(), false);
  privacy.setCloudBackup(true);
  assert.notEqual(privacy.getCloudConsent().id, firstId);
});

test('a policy version change disables previous backup until an explicit new choice', () => {
  const { privacy, memory } = fixture();
  memory.set(privacy.SETTINGS_KEY, { schemaVersion: 1, policyVersion: '2025-01-01', acceptedAt: '2025-01-01', cloudBackup: true, cloudConsentId: 'old-id', revision: 2 });
  assert.equal(privacy.getSettings().policyAccepted, false);
  assert.equal(privacy.isCloudBackupEnabled(), false);
});

test('refusing native WeChat privacy authorization does not turn on backup', async () => {
  const { privacy } = fixture({ requirePrivacyAuthorize: options => options.fail({ errMsg: 'user declined' }) });
  await assert.rejects(privacy.authorizeWeChatPrivacy(), /云备份没有开启/);
  assert.equal(privacy.isCloudBackupEnabled(), false);
});

test('first launch enables backup after native WeChat privacy authorization', async () => {
  let prompts = 0;
  const { privacy } = fixture({ requirePrivacyAuthorize: options => { prompts += 1; options.success({}); } });
  assert.equal(await privacy.enableCloudBackupByDefault(), true);
  assert.equal(privacy.isCloudBackupEnabled(), true);
  assert.equal(prompts, 1);
  assert.equal(await privacy.enableCloudBackupByDefault(), true);
  assert.equal(prompts, 1, 'an enabled account is not prompted again');
});

test('declining default backup keeps local mode and does not repeatedly prompt', async () => {
  let prompts = 0;
  const { privacy } = fixture({ requirePrivacyAuthorize: options => { prompts += 1; options.fail({ errMsg: 'user declined' }); } });
  assert.equal(await privacy.enableCloudBackupByDefault(), false);
  assert.equal(await privacy.enableCloudBackupByDefault(), false);
  assert.equal(privacy.isCloudBackupEnabled(), false);
  assert.equal(prompts, 1);
});

test('an explicitly disabled backup is never automatically re-enabled', async () => {
  let prompts = 0;
  const { privacy } = fixture({ requirePrivacyAuthorize: options => { prompts += 1; options.success({}); } });
  privacy.setCloudBackup(true);
  privacy.revokeCloudBackup();
  assert.equal(await privacy.enableCloudBackupByDefault(), false);
  assert.equal(privacy.isCloudBackupEnabled(), false);
  assert.equal(prompts, 0);
});

test('an older WeChat without privacy APIs can continue locally and cannot silently enable native authorization', async () => {
  const { privacy } = fixture();
  await assert.rejects(privacy.authorizeWeChatPrivacy(), /升级微信/);
  assert.equal(privacy.isCloudBackupEnabled(), false);
});

test('unavailable local storage fails consent persistence instead of pretending backup was enabled', () => {
  const { privacy, wx } = fixture();
  wx.setStorageSync = () => { throw new Error('storage full'); };
  assert.throws(() => privacy.setCloudBackup(true), /无法保存/);
  assert.equal(privacy.isCloudBackupEnabled(), false);
});
