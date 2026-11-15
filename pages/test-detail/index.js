const { report, EVENTS } = require('../../utils/track.js');
const display = require('../../data/exploration.js');
const { DEFAULT_SHARE_IMAGE } = require('../../utils/share-card.js');
const archive = require('../../utils/archive.js');
const { OPTIONS: CONTEXT_OPTIONS, getContext } = require('../../utils/life-context.js');
const drafts = require('../../utils/answer-drafts.js');

Page({
  data: {
    test: {}, error: '', contextOptions: CONTEXT_OPTIONS, selectedContext: 'ordinary', hasHistory: false,
    draft: null, draftMessage: '', starting: false
  },
  onLoad(options) {
    this._disposed = false;
    const testId = options && options.id;
    report(EVENTS.DETAIL_VIEW, { testId: testId });
    this.loadTestData(testId);
  },
  onShow() {
    this._starting = false;
    if (!this._disposed && this._test) this.refreshDraft();
  },
  loadTestData(testId) {
    try {
      const test = require('../../data/test-loader.js').getTest(testId);
      if (!test) throw new Error('没有找到这项测试，请返回探索页重新选择。');
      this._test = test;
      const displayName = display.tests[testId] && display.tests[testId].title || test.name;
      // Questions, reports and scoring rules stay in the service layer. Sending
      // the complete test through setData makes the view layer serialize tens of
      // kilobytes even though this page only renders the summary below.
      const summary = {
        id: test.id,
        name: test.name,
        displayName,
        icon: test.icon,
        description: test.description,
        questionsCount: test.questionsCount,
        time: test.time,
        cover: test.cover || '',
        coverAssetPath: test.coverAssetPath || '',
        formatValue: test.format && test.format.value || String(test.questionsCount),
        formatLabel: test.format && test.format.label || '道自我观察',
        shareTitle: test.interaction && test.interaction.shareTitle || '',
        timelineTitle: test.interaction && test.interaction.timelineTitle || '',
        dimensionLabels: test.scoring.strategy === 'profile' ? test.scoring.dimensionMeta.map(item => item.label) : [],
        note: test.note || ''
      };
      const records = archive.getRecords(testId);
      this.setData({
        test: summary, error: '',
        hasHistory: records.some(record => record.scoringVersion !== 'legacy')
      });
      this.refreshDraft(records);
      this.loadCoverAsset(summary);
      if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: displayName });
    } catch (error) {
      this.setData({ error: error.message || '测试暂时未能打开，请返回探索页重试。' });
    }
  },
  refreshDraft(records) {
    if (!this._test || this._disposed) return;
    try {
      const draft = drafts.getDraft(this._test, records || archive.getRecords(this._test.id));
      this._draft = draft;
      // Only a small progress summary crosses into the view. Original answers
      // and their shuffled order stay in the service layer on this device.
      this.setData({
        draft: draft ? {
          answeredCount: draft.answeredCount, totalCount: this._test.questions.length,
          selectedCount: draft.selectedCount, allAnswered: draft.allAnswered,
          ranking: this._test.interaction && this._test.interaction.type === 'ranking',
          contextLabel: getContext(draft.lifeContext).label,
          progressPercent: Math.round(draft.answeredCount / this._test.questions.length * 100)
        } : null,
        draftMessage: '', starting: false
      });
    } catch (error) {
      this._draft = null;
      this.setData({ draft: null, draftMessage: '上次进度暂未读出，仍可开始新的测试。', starting: false });
    }
  },
  async loadCoverAsset(test) {
    if (!test.coverAssetPath) return;
    try {
      const url = await require('../../utils/public-assets.js').resolvePublicAsset(test.coverAssetPath);
      if (!this._disposed && url && this.data.test.id === test.id) {
        this.setData({ test: Object.assign({}, this.data.test, { cover: url }) });
      }
    } catch (error) { /* Keep the lightweight icon placeholder. */ }
  },
  selectContext(event) {
    const id = event.currentTarget.dataset.id;
    if (getContext(id)) this.setData({ selectedContext: id });
  },
  startTest() {
    const testId = this.data.test.id;
    if (!testId) return;
    if (!getContext(this.data.selectedContext)) {
      wx.showToast({ title: '先选择这次的状态', icon: 'none' });
      return;
    }
    this.openAnswer(`/pages/test-answer/index?id=${encodeURIComponent(testId)}&context=${encodeURIComponent(this.data.selectedContext)}${this._draft ? '&restart=1' : ''}`);
  },
  resumeTest() {
    if (!this._test || !this._draft) return;
    this.openAnswer(`/pages/test-answer/index?id=${encodeURIComponent(this._test.id)}&resume=1`);
  },
  openAnswer(url) {
    if (this._disposed || this._starting) return;
    this._starting = true;
    this.setData({ starting: true });
    wx.navigateTo({
      url,
      complete: () => {
        this._starting = false;
        if (!this._disposed) this.setData({ starting: false });
      },
      fail: () => wx.showToast({ title: '页面暂未打开，请再试一次', icon: 'none' })
    });
  },
  goToHome() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  onUnload() { this._disposed = true; },
  onShareAppMessage() {
    const test = this.data.test;
    return {
      title: test.shareTitle || `${test.displayName || '人格测试树'}｜认识自己，让人格树长出新叶`,
      path: test.id ? `/pages/test-detail/index?id=${encodeURIComponent(test.id)}` : '/pages/test-hall/index',
      imageUrl: DEFAULT_SHARE_IMAGE
    };
  },
  onShareTimeline() {
    const test = this.data.test;
    return { title: test.timelineTitle || `${test.displayName || '人格测试树'}｜一起探索独特的自己`, query: test.id ? `id=${encodeURIComponent(test.id)}` : '' };
  }
})
