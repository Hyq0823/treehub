const { report, EVENTS } = require('../../utils/track.js');
const archive = require('../../utils/archive.js');
const { resolveReport, SCORING_VERSION } = require('../../utils/scoring.js');

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    test: {}, result: {}, record: null, savedAt: '', state: 'loading',
    stateTitle: '', stateMessage: '', legacy: false, playful: false, resultIcon: '✦'
  },
  onLoad(options) {
    try {
      const imported = require('../../data/tests/index.js');
      const test = (imported.default || imported).find(item => item.id === options.id);
      if (!test) {
        this.showState('missing', '没有找到这项测试', '回到探索大厅，选择一项感兴趣的测试。');
        return;
      }
      this._test = test;
      this.setData({
        test: { id: test.id, name: test.name, icon: test.icon },
        playful: ['sbti', 'shadow'].includes(test.id), resultIcon: test.icon || '✦'
      });
      // A record-specific URL must never fall through to a different historical result.
      const record = options.recordId ? archive.getRecord(options.recordId) : archive.getLatest(test.id);
      if (!record || record.testId !== test.id || (options.recordId && record.id !== options.recordId)) {
        this.showState('missing', options.recordId ? '这份记录不在当前设备' : '开始你的这次探索',
          '测评档案保存在各自设备上。完成这项测试，就能收集自己的卡片。');
        report(EVENTS.RESULT_VIEW_FOREIGN, { testId: test.id });
        return;
      }
      const result = resolveReport(test, record);
      if (!result) {
        this.showState('missing', '旧版记录暂时无法解读', '记录仍保存在本地。可以重新测试，生成新版报告并留下新的成长记录。');
        return;
      }
      this.setData({
        record: { id: record.id, treeSnapshot: record.treeSnapshot || null },
        result, savedAt: record.migrated || record.scoringVersion === 'legacy'
          ? '旧版导入 · 原测评时间未知' : formatTime(record.completedAt),
        legacy: record.scoringVersion !== SCORING_VERSION, state: 'ready'
      });
      report(EVENTS.RESULT_VIEW, { testId: test.id, resultType: record.resultType });
    } catch (error) {
      this.showState('error', '暂时无法读取档案', error.message || '请稍后重试，设备中的记录不会被覆盖。');
    }
  },
  showState(state, title, message) {
    this.setData({ state, stateTitle: title, stateMessage: message });
  },
  retakeTest() {
    if (!this.data.test.id) return;
    wx.redirectTo({ url: `/pages/test-answer/index?id=${encodeURIComponent(this.data.test.id)}` });
  },
  goToHome() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  goToArchive() { wx.switchTab({ url: '/pages/user-center/index' }); },
  instrumentShare() {
    report(EVENTS.SHARE_TAP, { testId: this.data.test.id || '', resultType: this.data.result.type || '' });
  },
  onShareAppMessage() {
    this.instrumentShare();
    return {
      title: `${this.data.test.name || '人格测试树'} · 一起探索自己的另一面`,
      path: this.data.test.id ? `/pages/test-detail/index?id=${encodeURIComponent(this.data.test.id)}` : '/pages/test-hall/index'
    };
  },
  onShareTimeline() {
    this.instrumentShare();
    return {
      title: `${this.data.test.name || '人格测试树'} · 留下一次认识自己的记录`,
      query: this.data.test.id ? `id=${encodeURIComponent(this.data.test.id)}` : ''
    };
  }
});
