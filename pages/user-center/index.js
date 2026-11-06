const archive = require('../../utils/archive.js');
const cloudSync = require('../../utils/cloud-sync.js');
const privacy = require('../../utils/privacy.js');
const { getTree } = require('../../utils/personality-tree.js');
const { resolveReport } = require('../../utils/scoring.js');
const { STAGES: ALL_STAGES } = require('../../data/trees.js');
const catalogModule = require('../../data/tests/index.js');
const catalog = catalogModule.default || catalogModule;
const STAGES = ALL_STAGES.filter(stage => stage.threshold > 0);
function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '早期测评记录';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
Page({
  data: {
    loaded: false, error: '', tree: null, groups: [], stages: [], expandedTests: {},
    totalCount: 0, uniqueCount: 0, repeatCount: 0, catalogCount: catalog.length,
    coveragePercent: 0, evidence: [],
    cloudState: 'syncing', cloudTitle: '正在准备云备份', cloudDetail: '云备份默认开启，原始逐题答案仍只保存在本机。',
    cloudRetrying: false
  },
  onShow() {
    this._hidden = false;
    require('../../utils/tab-bar.js').syncTabBar(this, '/pages/user-center/index');
    this.loadArchive();
    this.refreshCloud();
    try {
      const ready = getApp().globalData.cloudBackupReady;
      if (ready && typeof ready.then === 'function') ready.then(() => {
        if (!this._hidden) this.refreshCloud();
      });
    } catch (error) {}
  },
  formatSyncTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },
  applyCloudStatus(status) {
    const state = status && status.state || 'pending';
    const titles = {
      syncing: '正在同步到微信云端', synced: '云端档案已同步',
      pending: '等待云端同步', unavailable: '当前版本暂不支持云同步', idle: '云端备份已开启',
      local: '测评记录仅保存在本机', disabled: '测评记录仅保存在本机', paused: '云备份已暂停',
      delete_pending: '云端数据删除待完成'
    };
    let detail = status && status.message || '云备份默认开启，原始逐题答案仍只保存在本机。';
    if (state === 'synced' && status.lastSyncedAt) detail += ` · ${this.formatSyncTime(status.lastSyncedAt)}`;
    this.setData({ cloudState: state, cloudTitle: titles[state] || titles.pending, cloudDetail: detail });
  },
  refreshCloud() {
    const request = this._cloudRequest = (this._cloudRequest || 0) + 1;
    if (!privacy.isCloudBackupEnabled()) {
      const status = cloudSync.getStatus();
      this.applyCloudStatus(status.state === 'delete_pending' ? status : Object.assign({}, status, { state: 'local', message: '云备份未开启，你可以在隐私与数据管理中重新开启。' }));
      return Promise.resolve(status);
    }
    this.applyCloudStatus(Object.assign({}, cloudSync.getStatus(), { state: 'syncing', message: '正在合并本地与云端档案…' }));
    return cloudSync.syncArchive().then(status => {
      if (request !== this._cloudRequest) return;
      this.applyCloudStatus(status);
      if (status.state === 'synced') this.loadArchive();
      return status;
    }).catch(() => {
      const status = cloudSync.getStatus();
      if (request === this._cloudRequest) this.applyCloudStatus(status);
      return status;
    });
  },
  async retryCloudSync() {
    if (this.data.cloudRetrying) return;
    this.setData({ cloudRetrying: true });
    try {
      const status = await this.refreshCloud();
      if (this._hidden) return;
      if (status && status.state === 'synced') wx.showToast({ title: '云端档案已同步', icon: 'success' });
      else {
        const notDeployed = status && /尚未部署/.test(status.message || '');
        wx.showToast({ title: notDeployed ? '云同步服务尚未部署' : '仍未连接，稍后再试', icon: 'none' });
      }
    } finally {
      if (!this._hidden) this.setData({ cloudRetrying: false });
    }
  },
  loadArchive() {
    try {
      const saved = archive.getArchive();
      const tree = getTree(saved, catalog);
      const records = saved.records.slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
      const groups = catalog.map(test => {
        const history = records.filter(record => record.testId === test.id).map(record => {
          let title = '早期测评结果';
          try {
            const report = resolveReport(test, record);
            title = report && report.title || title;
          } catch (error) {
            // Preserve older records even when their scoring version has no report.
          }
          const legacy = record.scoringVersion === 'legacy' || !!record.migrated;
          return {
            id: record.id, testId: test.id, title,
            date: legacy ? '旧版导入 · 原测评时间未知' : formatDate(record.completedAt),
            legacy, premiumUnlocked: !!record.premiumUnlockedAt
          };
        });
        return { id: test.id, name: test.name, icon: test.icon, count: history.length, latest: history[0], history };
      }).filter(group => group.count);
      this.setData({
        loaded: true, error: '', tree, groups,
        stages: STAGES.map(stage => Object.assign({}, stage, { reached: tree.uniqueCount >= stage.threshold, planned: stage.threshold > catalog.length })),
        uniqueCount: tree.uniqueCount, totalCount: tree.totalCount,
        repeatCount: Math.max(0, tree.totalCount - tree.uniqueCount),
        coveragePercent: tree.progress,
        evidence: tree.evidence || []
      });
    } catch (error) {
      this.setData({ loaded: true, error: error.message || '暂时无法读取本地档案，请稍后重试。' });
    }
  },
  toggleHistory(event) {
    const id = event.currentTarget.dataset.id;
    const expandedTests = Object.assign({}, this.data.expandedTests);
    expandedTests[id] = !expandedTests[id];
    this.setData({ expandedTests });
  },
  openRecord(event) {
    const { id, recordId } = event.currentTarget.dataset;
    if (id && recordId) wx.navigateTo({ url: `/packages/reports/index?id=${encodeURIComponent(id)}&recordId=${encodeURIComponent(recordId)}` });
  },
  retakeTest(event) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/test-detail/index?id=${encodeURIComponent(id)}` });
  },
  explore() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  openTree() { wx.switchTab({ url: '/pages/my-tree/index' }); },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
  onHide() { this._hidden = true; this._cloudRequest = (this._cloudRequest || 0) + 1; },
  onUnload() { this.onHide(); },
  openGrowthHistory() { wx.navigateTo({ url: '/pages/tree-history/index' }); }
});
