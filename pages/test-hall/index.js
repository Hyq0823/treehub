Page({
  data: {
    tests: []
  },
  onLoad() {
    // 加载测试数据
    this.loadTests();
  },
  loadTests() {
    try {
      // 导入测试数据
      const tests = require('../../data/tests/index.js');
      const testList = tests.default || tests;
      this.setData({
        tests: testList
      });
    } catch (error) {
      console.error('Error loading tests:', error);
      wx.showToast({
        title: '数据加载错误',
        icon: 'none'
      });
    }
  },
  goToTestDetail(e) {
    console.log('goToTestDetail called');
    console.log('Event object:', e);
    const testId = e.currentTarget.dataset.id;
    console.log('Test ID:', testId);
    
    if (testId) {
      wx.navigateTo({
        url: `/pages/test-detail/index?id=${testId}`,
        success: function(res) {
          console.log('Navigation successful:', res);
        },
        fail: function(res) {
          console.error('Navigation failed:', res);
          wx.showToast({
            title: '跳转失败',
            icon: 'none'
          });
        }
      });
    } else {
      console.error('No testId found');
      wx.showToast({
        title: '测试ID获取失败',
        icon: 'none'
      });
    }
  }
})