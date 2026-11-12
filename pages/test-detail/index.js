const { report, EVENTS } = require('../../utils/track.js');
const display = require('../../data/exploration.js');
const { DEFAULT_SHARE_IMAGE } = require('../../utils/share-card.js');
const archive = require('../../utils/archive.js');
const { OPTIONS: CONTEXT_OPTIONS, getContext } = require('../../utils/life-context.js');

Page({
  data: {
    test: {}, error: '', contextOptions: CONTEXT_OPTIONS, selectedContext: 'ordinary', hasHistory: false
  },
  onLoad(options) {
    this._disposed = false;
    const testId = options && options.id;
    report(EVENTS.DETAIL_VIEW, { testId: testId });
    this.loadTestData(testId);
  },
  loadTestData(testId) {
    try {
      const tests = require('../../data/tests/index.js');
      const testList = tests.default || tests;
      const test = testList.find(t => t.id === testId);
      if (!test) throw new Error('没有找到这项测试，请返回探索页重新选择。');
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
      this.setData({
        test: summary, error: '',
        hasHistory: archive.getRecords(testId).some(record => record.scoringVersion !== 'legacy')
      });
      this.loadCoverAsset(summary);
      if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: displayName });
    } catch (error) {
      this.setData({ error: error.message || '测试暂时未能打开，请返回探索页重试。' });
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
    wx.navigateTo({
      url: `/pages/test-answer/index?id=${encodeURIComponent(testId)}&context=${encodeURIComponent(this.data.selectedContext)}`
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
