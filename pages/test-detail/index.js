const { report, EVENTS } = require('../../utils/track.js');
const display = require('../../data/exploration.js');

Page({
  data: {
    test: {}, error: ''
  },
  onLoad(options) {
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
      this.setData({
        test: Object.assign({}, test, { displayName }), error: ''
      });
      if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: displayName });
    } catch (error) {
      this.setData({ error: error.message || '测试暂时未能打开，请返回探索页重试。' });
    }
  },
  startTest() {
    const testId = this.data.test.id;
    if (!testId) return;
    wx.navigateTo({
      url: `/pages/test-answer/index?id=${testId}`
    });
  },
  goToHome() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  onShareAppMessage() {
    const test = this.data.test;
    return {
      title: `${test.displayName || '人格测试树'}｜认识自己，让人格树长出新叶`,
      path: test.id ? `/pages/test-detail/index?id=${encodeURIComponent(test.id)}` : '/pages/test-hall/index'
    };
  },
  onShareTimeline() {
    const test = this.data.test;
    return { title: `${test.displayName || '人格测试树'}｜一起探索独特的自己`, query: test.id ? `id=${encodeURIComponent(test.id)}` : '' };
  }
})
