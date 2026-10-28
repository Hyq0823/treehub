App({
  onLaunch() {
    this.recordEnterScene();
  },
  onShow() {
    // 每次进入都覆盖，取最近一次的来源场景
    this.recordEnterScene();
  },
  recordEnterScene() {
    try {
      const opts = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : wx.getLaunchOptionsSync();
      this.globalData.enterScene = opts.scene;
      this.globalData.enterPath = opts.path;
      this.globalData.enterQuery = opts.query;
    } catch (e) {}
  },
  globalData: {
    userInfo: null,
    enterScene: 0,
    enterPath: '',
    enterQuery: {}
  }
})
