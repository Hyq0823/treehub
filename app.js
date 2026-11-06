App({
  onLaunch() {
    this.recordEnterScene();
    this._firstShow = true;
    // Let the first page paint before privacy/cloud initialization and network
    // synchronization. Backup remains the default once native authorization is ready.
    this.globalData.cloudBackupReady = new Promise(resolve => {
      this._backupStartTimer = setTimeout(() => {
        this._backupStartTimer = null;
        Promise.resolve(this.startDefaultCloudBackup()).then(resolve, () => resolve(false));
      }, 900);
    });
  },
  onShow() {
    if (this._firstShow) {
      this._firstShow = false;
      return;
    }
    // 每次进入都覆盖，取最近一次的来源场景
    this.recordEnterScene();
    require('./utils/cloud-sync.js').schedule(800, { ifStale: true });
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
      return Promise.resolve(true);
    }
    return privacy.enableCloudBackupByDefault().then(enabled => {
      if (enabled) cloudSync.start();
      return enabled;
    }).catch(() => {});
  },
  globalData: {
    userInfo: null,
    enterScene: 0,
    enterPath: '',
    enterQuery: {},
    cloudBackupReady: null
  }
})
