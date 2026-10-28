const { report, EVENTS } = require('../../utils/track.js');

Page({
  data: {
    test: {},
    result: {}
  },
  onLoad(options) {
    const testId = options.id;
    this.loadTestData(testId, () => {
      this.loadResult(testId);
    });
  },
  getResultIcon(title) {
    // 根据不同的测试结果类型返回对应的图标
    const iconMap = {
      '物流师': '📦',
      '守卫者': '🛡️',
      '提倡者': '💡',
      '建筑师': '🏗️',
      '鉴赏家': '🔍',
      '探险家': '🧭',
      '调停者': '🤝',
      '逻辑学家': '🧠',
      '企业家': '💼',
      '表演者': '🎭',
      '竞选者': '🗳️',
      '辩论家': '💬',
      '执行官': '⚖️',
      '领事': '🤲',
      'protagonist': '🌟',
      '指挥官': '🎯',
      '完美主义者': '✨',
      '助人者': '🤗',
      '成就者': '🏆',
      '艺术型': '🎨',
      '思考者': '🧐',
      '忠诚者': '🤝',
      '享乐者': '🎉',
      '挑战者': '⚔️',
      '和平者': '🕊️',
      'e人': '👥',
      'i人': '🧑‍💻',
      '中间型': '⚖️',
      '阴影人格低': '🌑',
      '阴影人格中等': '🌒',
      '阴影人格高': '🌓',
      '开放性高': '🌊',
      '责任心强': '✅',
      '外向性高': '🚀',
      '宜人性高': '🤗',
      '神经质高': '🌪️',
      '开放性低': '🌄',
      '责任心低': '😴',
      '外向性低': '🌿',
      '宜人性低': '⚔️',
      '神经质低': '🌊'
    };
    return iconMap[title] || '🌟';
  },
  loadTestData(testId, callback) {
    try {
      const tests = require('../../data/tests/index.js');
      const testList = tests.default || tests;
      const test = testList.find(t => t.id === testId);
      if (test) {
        this.setData({
          test: test
        });
        if (callback) {
          callback();
        }
      } else {
        console.error('Test not found:', testId);
        wx.showToast({
          title: '测试数据加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('Error loading test data:', error);
      wx.showToast({
        title: '数据加载错误',
        icon: 'none'
      });
    }
  },
  instrumentResultView() {
    // 区分「自己测完回看」和「别人分享进来的」，后者是分享转化的分子
    const own = wx.getStorageSync('testResult');
    const isOwn = own && own.testId === this.data.test.id;
    report(isOwn ? EVENTS.RESULT_VIEW : EVENTS.RESULT_VIEW_FOREIGN, {
      testId: this.data.test.id,
      resultType: isOwn ? own.resultType : ''
    });
  },
  loadResult(testId) {
    this.instrumentResultView();
    try {
      const testResult = wx.getStorageSync('testResult');
      console.log('loadResult - testId:', testId);
      console.log('loadResult - testResult:', testResult);
      
      if (testResult && testResult.testId === testId) {
        const resultType = testResult.resultType;
        const reports = this.data.test.reports;
        console.log('loadResult - resultType:', resultType);
        console.log('loadResult - reports:', reports);
        
        const result = reports.find(r => r.type === resultType);
        console.log('loadResult - result:', result);
        
        if (result) {
          this.setData({
            result: result
          });
        } else {
          console.error('Result not found for type:', resultType);
          // 设置默认结果，防止显示空白
          this.setData({
            result: {
              title: '未知类型',
              summary: '测试结果未找到',
              description: '很抱歉，未能找到您的测试结果。请尝试重新测试。',
              advice: '请重新测试以获取准确的结果。'
            }
          });
        }
      } else {
        console.error('No test result found or testId mismatch');
        // 没有测试结果，引导用户进行测试
        wx.navigateTo({
          url: `/pages/test-answer/index?id=${testId}`
        });
      }
    } catch (error) {
      console.error('Error in loadResult:', error);
      // 发生错误，引导用户进行测试
      wx.navigateTo({
        url: `/pages/test-answer/index?id=${testId}`
      });
    }
  },
  retakeTest() {
    const testId = this.data.test.id;
    wx.navigateTo({
      url: `/pages/test-answer/index?id=${testId}`
    });
  },
  goToHome() {
    wx.navigateTo({
      url: '/pages/test-hall/index'
    });
  },
  // 分享功能
  instrumentShare() {
    report(EVENTS.SHARE_TAP, {
      testId: this.data.test.id,
      resultType: this.data.result.title
    });
  },
  onShareAppMessage() {
    this.instrumentShare();
    const testName = this.data.test.name;
    const resultTitle = this.data.result.title;
    const resultSummary = this.data.result.summary;
    
    return {
      title: `${testName}测试结果：${resultTitle}`,
      desc: resultSummary,
      path: `/pages/test-result/index?id=${this.data.test.id}`,
      imageUrl: this.data.result.image || ''
    };
  },
  
  // 分享到朋友圈
  onShareTimeline() {
    this.instrumentShare();
    const testName = this.data.test.name;
    const resultTitle = this.data.result.title;
    
    return {
      title: `${testName}测试结果：${resultTitle}`,
      query: `id=${this.data.test.id}`,
      imageUrl: this.data.result.image || ''
    };
  }

})