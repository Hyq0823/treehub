const { report, EVENTS } = require('../../utils/track.js');

Page({
  data: {
    test: {}
  },
  onLoad(options) {
    const testId = options.id;
    report(EVENTS.DETAIL_VIEW, { testId: testId });
    this.loadTestData(testId);
  },
  loadTestData(testId) {
    try {
      const tests = require('../../data/tests/index.js');
      const testList = tests.default || tests;
      const test = testList.find(t => t.id === testId);
      this.setData({
        test: test
      });
    } catch (error) {
      console.error('Error loading test data:', error);
      wx.showToast({
        title: '数据加载错误',
        icon: 'none'
      });
    }
  },
  startTest() {
    const testId = this.data.test.id;
    wx.navigateTo({
      url: `/pages/test-answer/index?id=${testId}`
    });
  }
})