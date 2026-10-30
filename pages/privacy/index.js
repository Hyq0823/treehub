const privacy = require('../../utils/privacy.js');
const cloudSync = require('../../utils/cloud-sync.js');
const archive = require('../../utils/archive.js');

function confirm(title, content, confirmText) {
  return new Promise(resolve => wx.showModal({ title, content, confirmText: confirmText || '确认', success: result => resolve(result.confirm === true), fail: () => resolve(false) }));
}

Page({
  data: {
    settings: {}, policy: privacy.POLICY_CONFIG, cloudStatus: {}, busy: false,
    message: '', wechatPrivacyNeeded: true, nativePrivacySupported: false,
    policyName: '微信隐私保护指引'
  },
  onLoad() {
    this._disposed = false;
    this.refresh();
    this.refreshNativePrivacy();
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
  agreePolicy() {
    try {
      privacy.acceptPolicy();
      this.setData({ message: '隐私政策选择已保存。云备份仍由你单独决定。' });
      this.refresh();
    } catch (error) { this.showError(error); }
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
    if (!privacy.getSettings().policyAccepted) {
      this.showError(new Error('请先阅读并同意本页隐私政策；不启用云备份也能完成测试。'));
      return;
    }
    const accepted = await confirm('单独选择云备份', '仅备份测试名称、结果类型、维度分数、完成时间、树种子和主题/报告解锁状态，用于同一微信账号恢复。原始逐题选项不上传。你可以随时关闭并删除云端数据。', '同意并开启');
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
    if (!await confirm('关闭云备份', '关闭后不再上传或拉取测评档案，已有云端内容会保留。若也要删除已有备份，请使用“删除云端数据”。', '关闭备份')) return;
    try {
      privacy.revokeCloudBackup(); cloudSync.stop();
      this.setData({ message: '云备份已关闭，本机测试和主题收藏可继续使用。' }); this.refresh();
    } catch (error) { this.showError(error); }
  },
  async deleteCloud() {
    if (this.data.busy) return;
    if (!await confirm('删除云端测评数据', '这会关闭云备份，并删除当前微信账号的云端结果摘要、树种子和主题/报告解锁状态。本机内容保留；云端删除无法撤销。', '删除云端')) return;
    this.setData({ busy: true, message: '' });
    try {
      await cloudSync.deleteCloudData();
      if (!this._disposed) this.setData({ message: '云端结果摘要、树种子和主题权益已删除。本机内容仍保留。' });
    } catch (error) { this.showError(new Error('云备份已关闭，云端删除尚未完成，请联网后重试。')); }
    finally { if (!this._disposed) { this.setData({ busy: false }); this.refresh(); } }
  },
  async deleteLocal() {
    if (this.data.busy) return;
    if (!await confirm('删除本机档案', '这会关闭云备份，并删除此设备的答案、结果、主题收藏和待保存解锁记录。已有云端备份不会被删除；如需同时删除，请再使用“删除云端数据”。', '删除本机')) return;
    try {
      privacy.revokeCloudBackup(); cloudSync.stop();
      archive.clearLocalArchive();
      require('../../utils/themes.js').clearLocalState();
      // A main-package page must not require JavaScript in an unloaded report
      // subpackage. Its helper observes this reset revision when next loaded.
      if (wx.removeStorageSync) wx.removeStorageSync('personalityTreePremiumPending.v1');
      try {
        const app = getApp();
        app.globalData.privacyResetRevision = (app.globalData.privacyResetRevision || 0) + 1;
      } catch (error) {}
      if (wx.removeStorageSync) wx.removeStorageSync(cloudSync.STATE_KEY);
      this.setData({ message: '本机档案与主题收藏已删除，云备份保持关闭。' }); this.refresh();
    } catch (error) { this.showError(error); }
  },
  async exportLocal() {
    if (this.data.busy) return;
    this.setData({ busy: true, message: '' });
    try {
      const value = { exportedAt: new Date().toISOString(), source: 'local', archive: archive.getArchive(), themes: require('../../utils/themes.js').getSyncPayload() };
      await this.shareExport(value);
    } catch (error) { this.showError(error); }
    finally { if (!this._disposed) this.setData({ busy: false }); }
  },
  async exportCloud() {
    if (this.data.busy) return;
    this.setData({ busy: true, message: '' });
    try { await this.shareExport(Object.assign({ source: 'cloud' }, await cloudSync.exportCloudData())); }
    catch (error) { this.showError(error); }
    finally { if (!this._disposed) this.setData({ busy: false }); }
  },
  shareExport(value) {
    return new Promise((resolve, reject) => {
      if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH || !wx.shareFileMessage) {
        reject(new Error('当前微信版本暂不支持文件导出，请升级微信后重试。')); return;
      }
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/personality-tree-export-${Date.now()}.json`;
      fs.writeFile({
        filePath, data: JSON.stringify(value, null, 2), encoding: 'utf8',
        success: () => {
          if (this._disposed) { fs.unlink({ filePath, complete() {} }); resolve(); return; }
          wx.shareFileMessage({
            filePath, fileName: '人格测试树-我的数据.json',
            success: resolve,
            fail: error => /cancel/i.test(error.errMsg || '') ? resolve() : reject(new Error('导出文件暂未能发送，请稍后重试。')),
            complete: () => fs.unlink({ filePath, complete() {} })
          });
        },
        fail: () => reject(new Error('导出文件暂时无法写入，请检查设备存储空间。'))
      });
    });
  },
  showError(error) {
    if (!this._disposed) this.setData({ message: error && error.message || '操作暂时未能完成，请稍后重试。' });
  }
});
