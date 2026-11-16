const archive = require('../../utils/archive.js');
const cloudSync = require('../../utils/cloud-sync.js');
const privacy = require('../../utils/privacy.js');
const { getTree } = require('../../utils/personality-tree.js');
const { STAGES: ALL_STAGES } = require('../../data/trees.js');
const { catalog } = require('../../data/test-catalog.js');
const { buildArchiveView, HISTORY_PAGE_SIZE } = require('../../utils/archive-view.js');
const STAGES = ALL_STAGES.filter(stage => stage.threshold > 0);
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
    this._navigating = false;
    this._navigationRequest = (this._navigationRequest || 0) + 1;
    if (this.data.cloudRetrying) this.setData({ cloudRetrying: false });
    const showRequest = this._showRequest = (this._showRequest || 0) + 1;
    require('../../utils/tab-bar.js').syncTabBar(this, '/pages/user-center/index');
    this.loadArchive();
    const refresh = () => {
      if (!this._hidden && showRequest === this._showRequest) return this.refreshCloud({ reuseFresh: true });
      return null;
    };
    try {
      const ready = getApp().globalData.cloudBackupReady;
      if (ready && typeof ready.then === 'function') {
        Promise.resolve(ready).then(refresh, refresh);
        return;
      }
    } catch (error) { /* Fall through to the local/cloud status refresh. */ }
    refresh();
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
  refreshCloud(options = {}) {
    const request = this._cloudRequest = (this._cloudRequest || 0) + 1;
    if (!privacy.isCloudBackupEnabled()) {
      const status = cloudSync.getStatus();
      this.applyCloudStatus(status.state === 'delete_pending' ? status : Object.assign({}, status, { state: 'local', message: '云备份未开启，你可以在隐私与数据管理中重新开启。' }));
      return Promise.resolve(status);
    }
    if (options.reuseFresh && typeof cloudSync.isAutoSyncFresh === 'function' && cloudSync.isAutoSyncFresh()) {
      const status = cloudSync.getStatus();
      this.applyCloudStatus(status);
      return Promise.resolve(status);
    }
    this.applyCloudStatus(Object.assign({}, cloudSync.getStatus(), { state: 'syncing', message: '正在合并本地与云端档案…' }));
    return Promise.resolve().then(() => cloudSync.syncArchive()).then(status => {
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
    if (this._hidden || this.data.cloudRetrying) return;
    const retry = this._retryRequest = (this._retryRequest || 0) + 1;
    this.setData({ cloudRetrying: true });
    try {
      const status = await this.refreshCloud();
      if (this._hidden || retry !== this._retryRequest) return;
      if (status && status.state === 'synced') wx.showToast({ title: '云端档案已同步', icon: 'success' });
      else {
        const notDeployed = status && /尚未部署/.test(status.message || '');
        wx.showToast({ title: notDeployed ? '云同步服务尚未部署' : '仍未连接，稍后再试', icon: 'none' });
      }
    } finally {
      if (!this._hidden && retry === this._retryRequest) this.setData({ cloudRetrying: false });
    }
  },
  loadArchive() {
    try {
      const saved = archive.getArchive();
      const tree = getTree(saved, catalog);
      const view = buildArchiveView(saved.records);
      const limits = this._historyLimits || Object.create(null);
      const expandedTests = {};
      const groups = view.groups.map(group => {
        if (!this.data.expandedTests[group.id] || group.count < 2) return group;
        const count = Math.max(HISTORY_PAGE_SIZE, limits[group.id] || HISTORY_PAGE_SIZE);
        const history = view.history(group.id, count);
        expandedTests[group.id] = true;
        return Object.assign({}, group, { history, visibleCount: history.length, hasMore: history.length < group.count });
      });
      this._archiveView = view;
      this._historyLimits = limits;
      this.setData({
        loaded: true, error: '', tree, groups, expandedTests,
        stages: STAGES.map(stage => Object.assign({}, stage, { reached: tree.uniqueCount >= stage.threshold, planned: stage.threshold > catalog.length })),
        uniqueCount: tree.uniqueCount, totalCount: tree.totalCount,
        repeatCount: Math.max(0, tree.totalCount - tree.uniqueCount),
        coveragePercent: tree.progress,
        evidence: tree.evidence || []
      });
    } catch (error) {
      this._archiveView = null;
      this.setData({ loaded: true, groups: [], expandedTests: {}, error: error.message || '暂时无法读取本地档案，请稍后重试。' });
    }
  },
  toggleHistory(event) {
    const id = event.currentTarget.dataset.id;
    const group = this.data.groups.find(item => item.id === id);
    if (this._hidden || !this._archiveView || !group || group.count < 2) return;
    const expandedTests = Object.assign({}, this.data.expandedTests);
    expandedTests[id] = !expandedTests[id];
    const limits = this._historyLimits || (this._historyLimits = Object.create(null));
    const count = Math.max(HISTORY_PAGE_SIZE, limits[id] || HISTORY_PAGE_SIZE);
    const history = expandedTests[id] ? this._archiveView.history(id, count) : [];
    limits[id] = count;
    const groups = this.data.groups.map(item => item.id === id
      ? Object.assign({}, item, { history, visibleCount: history.length, hasMore: history.length < item.count }) : item);
    this.setData({ groups, expandedTests });
  },
  loadMoreHistory(event) {
    const id = event.currentTarget.dataset.id;
    const group = this.data.groups.find(item => item.id === id);
    if (this._hidden || !this._archiveView || !this.data.expandedTests[id] || !group || !group.hasMore) return;
    const count = Math.min(group.count, group.visibleCount + HISTORY_PAGE_SIZE);
    const history = this._archiveView.history(id, count);
    this._historyLimits[id] = count;
    const groups = this.data.groups.map(item => item.id === id
      ? Object.assign({}, item, { history, visibleCount: history.length, hasMore: history.length < item.count }) : item);
    this.setData({ groups });
  },
  navigateArchive(url) {
    if (this._hidden || this._navigating) return;
    this._navigating = true;
    const request = this._navigationRequest = (this._navigationRequest || 0) + 1;
    const fail = () => {
      if (request !== this._navigationRequest) return;
      this._navigating = false;
      if (!this._hidden) wx.showToast({ title: '暂时未能打开，请再试一次', icon: 'none' });
    };
    try { wx.navigateTo({ url, fail }); }
    catch (error) { fail(); }
  },
  openRecord(event) {
    const { id, recordId } = event.currentTarget.dataset;
    if (id && recordId && this._archiveView && this._archiveView.contains(id, recordId)) {
      this.navigateArchive(`/packages/reports/index?id=${encodeURIComponent(id)}&recordId=${encodeURIComponent(recordId)}`);
    }
  },
  retakeTest(event) {
    const id = event.currentTarget.dataset.id;
    if (id && this.data.groups.some(group => group.id === id)) this.navigateArchive(`/pages/test-detail/index?id=${encodeURIComponent(id)}`);
  },
  openComparison(event) {
    const id = event.currentTarget.dataset.id;
    const group = this.data.groups.find(item => item.id === id);
    if (!group || !group.comparisonRecordId || !this._archiveView || !this._archiveView.contains(id, group.comparisonRecordId)) return;
    this.navigateArchive(`/packages/reports/compare/index?id=${encodeURIComponent(id)}&recordId=${encodeURIComponent(group.comparisonRecordId)}`);
  },
  explore() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  openTree() { wx.switchTab({ url: '/pages/my-tree/index' }); },
  openPrivacy() { this.navigateArchive('/pages/privacy/index'); },
  onHide() {
    this._hidden = true;
    this._navigationRequest = (this._navigationRequest || 0) + 1;
    this._showRequest = (this._showRequest || 0) + 1;
    this._cloudRequest = (this._cloudRequest || 0) + 1;
    this._retryRequest = (this._retryRequest || 0) + 1;
  },
  onUnload() { this.onHide(); },
  openGrowthHistory() { wx.navigateTo({ url: '/pages/tree-history/index' }); }
});
