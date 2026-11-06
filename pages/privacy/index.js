const privacy = require('../../utils/privacy.js');
const cloudSync = require('../../utils/cloud-sync.js');

function confirm(title, content, confirmText) {
  return new Promise(resolve => wx.showModal({ title, content, confirmText: confirmText || '确认', success: result => resolve(result.confirm === true), fail: () => resolve(false) }));
}

Page({
  data: {
    settings: {}, cloudStatus: {}, busy: false,
    message: '', wechatPrivacyNeeded: true, nativePrivacySupported: false,
    policyName: '微信隐私保护指引'
  },
  onLoad() {
    this._disposed = false;
    this.refresh();
    this.refreshNativePrivacy();
    try {
      const ready = getApp().globalData.cloudBackupReady;
      if (ready && typeof ready.then === 'function') ready.then(() => {
        this.refresh();
        this.refreshNativePrivacy();
      });
    } catch (error) {}
  },
  onShow() { this.refresh(); },
  onUnload() { this._disposed = true; },
  refresh() {
    if (!this._disposed) this.setData({ settings: privacy.getSettings(), cloudStatus: cloudSync.getStatus() });
  },
  refreshNativePrivacy() {
    if (!wx.getPrivacySetting) return;
    wx.getPrivacySetting({
      success: result => {
        if (!this._disposed) this.setData({
          nativePrivacySupported: true, wechatPrivacyNeeded: result.needAuthorization === true,
          policyName: result.privacyContractName || '微信隐私保护指引'
        });
      }
    });
  },
  continueLocal() {
    if (wx.navigateBack) wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/test-hall/index' }) });
    else wx.switchTab({ url: '/pages/test-hall/index' });
  },
  openWeChatPrivacy() {
    if (wx.openPrivacyContract) wx.openPrivacyContract({ fail: () => this.showError(new Error('隐私指引暂时未能打开，请稍后重试。')) });
    else this.showError(new Error('请升级微信后查看微信隐私保护指引。'));
  },
  async enableCloud() {
    if (this.data.busy) return;
    const accepted = await confirm('重新开启云备份', '仅备份测试名称、结果类型、维度分数、完成时间、树种子和主题/报告解锁状态，用于同一微信账号恢复。原始逐题选项不上传，你可以随时关闭。', '开启备份');
    if (!accepted || this._disposed) return;
    this.setData({ busy: true, message: '' });
    try {
      await privacy.authorizeWeChatPrivacy();
      if (this._disposed) return;
      privacy.setCloudBackup(true);
      this.refreshNativePrivacy();
      const status = await cloudSync.syncArchive();
      if (!this._disposed) this.setData({ message: status.message });
    } catch (error) { this.showError(error); }
    finally { if (!this._disposed) { this.setData({ busy: false }); this.refresh(); } }
  },
  async disableCloud() {
    if (this.data.busy) return;
    if (!await confirm('关闭云备份', '关闭后不再上传或拉取测评档案，已有云端内容会保留，本机测试与主题收藏不受影响。', '关闭备份')) return;
    try {
      privacy.revokeCloudBackup(); cloudSync.stop();
      this.setData({ message: '云备份已关闭，本机测试和主题收藏可继续使用。' }); this.refresh();
    } catch (error) { this.showError(error); }
  },
  showError(error) {
    if (!this._disposed) this.setData({ message: error && error.message || '操作暂时未能完成，请稍后重试。' });
  }
});
