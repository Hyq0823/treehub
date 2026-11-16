const archive = require('../../../utils/archive.js');
const { buildComparisonModel } = require('../comparison-model.js');
const { DEFAULT_SHARE_IMAGE } = require('../../../utils/share-card.js');
const BASELINE_PAGE_SIZE = 5;

Page({
  data: {
    state: 'loading', error: '', test: {}, before: null, after: null,
    dimensions: [], note: '', headline: '', axisCaption: '', reflection: '', intervalLabel: '', versionLabel: '',
    limited: false, hiddenDimensionCount: 0, baselineCount: 0, premiumSavePending: false,
    pickerOpen: false, baselines: [], baselinesHasMore: false,
    shareBusy: false, shareImage: '', shareError: ''
  },
  onLoad(options = {}) {
    this._disposed = false; this._hidden = false;
    this._options = { id: options.id, recordId: options.recordId || '', previousRecordId: options.previousRecordId || '' };
    this.loadComparison();
    if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: '两次的我' });
  },
  onShow() {
    this._navigationRequest = (this._navigationRequest || 0) + 1;
    this._hidden = false; this._opening = false;
    if (this._shown) this.loadComparison();
    this._shown = true;
  },
  loadComparison(reuseRecords = false) {
    if (this._disposed) return;
    this._shareRequest = (this._shareRequest || 0) + 1;
    try {
      const test = require('../../../data/test-loader.js').getTest(this._options.id);
      if (!reuseRecords || !this._records) {
        this._records = archive.getRecords();
        this._pendingGrants = new Map();
      }
      const model = buildComparisonModel(test, this._records, Object.assign({}, this._options, {
        pendingGrantFor: recordId => {
          if (!this._pendingGrants.has(recordId)) {
            let receipt = null;
            try { receipt = require('../premium-access.js').getPendingGrant(recordId); }
            catch (error) { /* A failed read is retried after returning, not for each baseline. */ }
            this._pendingGrants.set(recordId, receipt);
          }
          return this._pendingGrants.get(recordId);
        }
      }));
      this._model = model;
      this._options.recordId = model.current.id;
      this._options.previousRecordId = model.previous.id;
      this._baselineVisible = BASELINE_PAGE_SIZE;
      const key = JSON.stringify(this.snapshotFromView(model.view));
      this.setData(Object.assign({}, model.view, {
        state: 'ready', error: '', pickerOpen: false, baselines: [], baselinesHasMore: false,
        shareBusy: false, shareError: '', shareImage: this._shareCache && this._shareCache.get(key) || ''
      }));
    } catch (error) {
      this._model = null;
      this.setData({ state: 'empty', error: error.message || '暂时无法读取这两份记录，请稍后重试。',
        before: null, after: null, dimensions: [], pickerOpen: false, baselines: [],
        shareBusy: false, shareImage: '', shareError: '', premiumSavePending: false });
    }
  },
  snapshotFromView(view) {
    return {
      testId: view.test.id, testName: view.test.name,
      beforeTitle: view.before.title, afterTitle: view.after.title,
      beforeDate: view.before.date, afterDate: view.after.date,
      dimensions: view.dimensions.map(item => ({ id: item.id, label: item.label, before: item.before, after: item.after, delta: item.delta })),
      note: view.note
    };
  },
  comparisonCardSnapshot() { return this._model ? this.snapshotFromView(this._model.view) : null; },
  toggleBaselines() {
    if (this._hidden || this._disposed || !this._model || this.data.shareBusy) return;
    if (this.data.pickerOpen) { this.setData({ pickerOpen: false, baselines: [] }); return; }
    this._baselineVisible = BASELINE_PAGE_SIZE;
    this.setData({ pickerOpen: true }); this.renderBaselines();
  },
  renderBaselines() {
    if (!this._model) return;
    const records = this._model.candidateRecords;
    this.setData({
      baselines: records.slice(0, this._baselineVisible).map(record => Object.assign(this._model.candidateSummary(record), { selected: record.id === this._model.previous.id })),
      baselinesHasMore: records.length > this._baselineVisible
    });
  },
  loadMoreBaselines() {
    if (this._hidden || this._disposed || !this.data.pickerOpen || !this._model) return;
    this._baselineVisible = Math.min(this._model.candidateRecords.length, this._baselineVisible + BASELINE_PAGE_SIZE);
    this.renderBaselines();
  },
  selectBaseline(event) {
    if (this._hidden || this._disposed || !this._model || this.data.shareBusy) return;
    const id = event.currentTarget.dataset.id;
    if (!this._model.candidateRecords.some(record => record.id === id)) return;
    this._options.previousRecordId = id;
    this.loadComparison(true);
  },
  async prepareComparisonCard() {
    if (this._hidden || this._disposed || this.data.state !== 'ready' || this.data.shareBusy) return;
    const snapshot = this.comparisonCardSnapshot();
    const key = JSON.stringify(snapshot);
    this._shareCache = this._shareCache || new Map();
    if (this._shareCache.has(key)) { this.setData({ shareImage: this._shareCache.get(key), shareError: '' }); return; }
    const request = this._shareRequest = (this._shareRequest || 0) + 1;
    const isCancelled = () => this._hidden || this._disposed || request !== this._shareRequest || key !== JSON.stringify(this.comparisonCardSnapshot());
    this.setData({ shareBusy: true, shareError: '' });
    try {
      const result = await require('../comparison-share-card.js').buildComparisonShareCard(this, snapshot, isCancelled);
      if (isCancelled()) return;
      const path = typeof result === 'string' ? result : result && result.path;
      if (!path) throw new Error('变化卡暂未能导出，请再试一次。');
      this._shareCache.set(key, path);
      if (this._shareCache.size > 3) this._shareCache.delete(this._shareCache.keys().next().value);
      this.setData({ shareImage: path });
    } catch (error) {
      if (!isCancelled()) this.setData({ shareError: error.message || '变化卡暂未能生成，请再试一次。' });
    } finally { if (!isCancelled()) this.setData({ shareBusy: false }); }
  },
  previewComparisonCard() {
    if (this._hidden || this._disposed || this.data.shareBusy) return;
    const key = JSON.stringify(this.comparisonCardSnapshot());
    const image = this._shareCache && this._shareCache.get(key);
    if (image && this.data.shareImage === image) wx.previewImage({ current: image, urls: [image] });
  },
  openReport(event) {
    if (this._hidden || this._disposed || this._opening || !this._model) return;
    const side = event && event.currentTarget && event.currentTarget.dataset.side;
    const record = side === 'before' ? this._model.previous : this._model.current;
    let reusePrevious = false;
    if (typeof getCurrentPages === 'function' && typeof wx.navigateBack === 'function') {
      try {
        const pages = getCurrentPages();
        const previous = pages && pages[pages.length - 2];
        reusePrevious = !!previous && previous.route === 'packages/reports/index' &&
          !!previous.data && !!previous.data.record && previous.data.record.id === record.id;
      } catch (error) { /* A missing native page stack still permits the exact report link. */ }
    }
    this.navigate(`/packages/reports/index?id=${encodeURIComponent(record.testId)}&recordId=${encodeURIComponent(record.id)}`, false, reusePrevious);
  },
  retake() {
    if (this._hidden || this._disposed || this._opening || !this._options.id) return;
    this.navigate(`/pages/test-detail/index?id=${encodeURIComponent(this._options.id)}`, true);
  },
  navigate(url, redirect = false, back = false) {
    if (this._hidden || this._disposed || this._opening) return;
    this._opening = true;
    const request = this._navigationRequest = (this._navigationRequest || 0) + 1;
    const fail = () => {
      if (request !== this._navigationRequest || this._disposed) return;
      this._opening = false;
      if (!this._hidden) wx.showToast({ title: '暂时未能打开，请再试一次', icon: 'none' });
    };
    try {
      if (back) wx.navigateBack({ delta: 1, fail });
      else wx[redirect ? 'redirectTo' : 'navigateTo']({ url, fail });
    }
    catch (error) { fail(); }
  },
  backToArchive() { if (!this._hidden && !this._disposed) wx.switchTab({ url: '/pages/user-center/index' }); },
  onHide() {
    this._hidden = true;
    this._navigationRequest = (this._navigationRequest || 0) + 1;
    this._shareRequest = (this._shareRequest || 0) + 1;
  },
  onUnload() { this._disposed = true; this.onHide(); },
  onShareAppMessage() {
    const id = this.data.test.id;
    return { title: `${this.data.test.name || '人格测试树'}｜收藏不同阶段的自己`,
      path: id ? `/pages/test-detail/index?id=${encodeURIComponent(id)}` : '/pages/test-hall/index', imageUrl: DEFAULT_SHARE_IMAGE };
  }
});
