// Preserve existing shared/bookmarked report URLs after moving reports into a subpackage.
Page({
  data: { error: '' },
  onLoad(options = {}) {
    const query = [];
    ['id', 'recordId'].forEach(key => {
      if (typeof options[key] === 'string' && options[key]) {
        query.push(`${key}=${encodeURIComponent(options[key])}`);
      }
    });
    this._reportUrl = `/packages/reports/index${query.length ? '?' + query.join('&') : ''}`;
    this.openReport();
  },
  openReport() {
    this.setData({ error: '' });
    wx.redirectTo({
      url: this._reportUrl,
      fail: () => this.setData({ error: '报告暂时未能打开，请检查网络后重试。' })
    });
  },
  goToHome() { wx.switchTab({ url: '/pages/test-hall/index' }); }
});
