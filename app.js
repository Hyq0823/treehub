App({
  onLaunch() {
    this.recordEnterScene();
    this.startDefaultCloudBackup();
  },
  onShow() {
    // 每次进入都覆盖，取最近一次的来源场景
    this.recordEnterScene();
    require('./utils/cloud-sync.js').schedule(0);
  },
  recordEnterScene() {
    try {
      const opts = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : wx.getLaunchOptionsSync();
      this.globalData.enterScene = opts.scene;
      this.globalData.enterPath = opts.path;
      this.globalData.enterQuery = opts.query;
    } catch (e) {}
  },
  startDefaultCloudBackup() {
    const privacy = require('./utils/privacy.js');
    const cloudSync = require('./utils/cloud-sync.js');
    if (privacy.isCloudBackupEnabled()) {
      cloudSync.start();
      this.globalData.cloudBackupReady = Promise.resolve(true);
      return this.globalData.cloudBackupReady;
    }
    this.globalData.cloudBackupReady = privacy.enableCloudBackupByDefault().then(enabled => {
      if (enabled) cloudSync.start();
      return enabled;
    }).catch(() => {});
    return this.globalData.cloudBackupReady;
  },
  globalData: {
    userInfo: null,
    enterScene: 0,
    enterPath: '',
    enterQuery: {},
    cloudBackupReady: null
  }
})
