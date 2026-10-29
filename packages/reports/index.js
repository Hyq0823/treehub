const { report, EVENTS } = require('../../utils/track.js');
const archive = require('../../utils/archive.js');
const { resolveReport, SCORING_VERSION } = require('../../utils/scoring.js');
const { buildDeepReport, basicDimensions } = require('./deep-report.js');
const { rewardedReport: REWARDED_AD_UNIT_ID } = require('./ads.js');
const premiumAccess = require('./premium-access.js');

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    test: {}, result: {}, record: null, savedAt: '', state: 'loading',
    stateTitle: '', stateMessage: '', legacy: false, playful: false, resultIcon: '✦',
    basicDimensions: [], deepReport: null, premiumAvailable: false,
    premiumUnlocked: false, premiumUnlockedAt: '', adReady: false,
    adLoading: false, adWatching: false, adError: '',
    premiumSavePending: false, premiumSaving: false, premiumSaveError: ''
  },
  onLoad(options) {
    this._disposed = false;
    this._adAttempt = null;
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
      const deepReport = buildDeepReport(test, record, result);
      const pendingGrant = !record.premiumUnlockedAt && premiumAccess.getPendingGrant(record.id);
      this.setData({
        record: { id: record.id, treeSnapshot: record.treeSnapshot || null },
        result, savedAt: record.migrated || record.scoringVersion === 'legacy'
          ? '旧版导入 · 原测评时间未知' : formatTime(record.completedAt),
        legacy: record.scoringVersion !== SCORING_VERSION,
        basicDimensions: basicDimensions(result), deepReport,
        premiumAvailable: !!deepReport,
        premiumUnlocked: !!record.premiumUnlockedAt || !!pendingGrant,
        premiumUnlockedAt: record.premiumUnlockedAt ? formatTime(record.premiumUnlockedAt) :
          pendingGrant ? formatTime(pendingGrant.completedAt) : '',
        premiumSavePending: !!pendingGrant,
        state: 'ready'
      });
      if (deepReport && !record.premiumUnlockedAt && !pendingGrant) this.setupRewardedVideoAd();
      report(EVENTS.RESULT_VIEW, { testId: test.id, resultType: record.resultType });
    } catch (error) {
      this.showState('error', '暂时无法读取档案', error.message || '请稍后重试，设备中的记录不会被覆盖。');
    }
  },
  onShow() {
    if (!this._disposed && this.data.premiumSavePending) this.retryPremiumSave({ silent: true });
  },
  showState(state, title, message) {
    this.setData({ state, stateTitle: title, stateMessage: message });
  },
  setupRewardedVideoAd() {
    if (this._disposed) return;
    if (!wx.createRewardedVideoAd || this._videoAd) {
      if (!wx.createRewardedVideoAd) {
        this.setData({ adError: '当前微信版本暂不支持激励视频，请升级微信后重试。' });
      }
      return;
    }
    try {
      const videoAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
      this._videoAd = videoAd;
      this._onAdLoad = () => {
        if (!this._disposed) this.setData({ adReady: true, adLoading: false, adError: '' });
      };
      this._onAdError = error => {
        if (this._disposed) return;
        console.error('激励视频广告加载失败', error);
        this.setData({
          adReady: false,
          adError: '广告暂时没有准备好，请稍后重试。'
        });
        // A failed initial show can still be retried by load(). Keep that attempt locked.
        if (!this._adAttempt) this.setData({ adLoading: false, adWatching: false });
      };
      this._onAdClose = result => {
        const attempt = this._adAttempt;
        if (!this.isCurrentAdAttempt(attempt)) return;
        this._adAttempt = null;
        this.setData({ adWatching: false, adLoading: false });
        if (result && result.isEnded === true) {
          this.completePremiumUnlock(attempt.recordId);
        } else {
          wx.showToast({ title: '完整看完视频即可解锁', icon: 'none' });
        }
      };
      videoAd.onLoad(this._onAdLoad);
      videoAd.onError(this._onAdError);
      videoAd.onClose(this._onAdClose);
    } catch (error) {
      console.error('激励视频广告创建失败', error);
      this.setData({ adError: '广告组件初始化失败，请稍后重试。' });
    }
  },
  isCurrentAdAttempt(attempt) {
    return !!attempt && !this._disposed && this._adAttempt === attempt && this._videoAd === attempt.ad;
  },
  async showPremiumAd() {
    if (this._disposed || !this.data.premiumAvailable || this.data.adWatching) return;
    if (this.data.premiumSavePending) {
      this.retryPremiumSave();
      return;
    }
    if (this.data.premiumUnlocked) return;
    if (!this._videoAd) {
      this.setupRewardedVideoAd();
      if (!this._videoAd) {
        wx.showModal({
          title: '暂时无法播放',
          content: this.data.adError || '当前环境暂不支持激励视频，请在手机微信中重试。',
          showCancel: false
        });
        return;
      }
    }
    const videoAd = this._videoAd;
    const attempt = { ad: videoAd, recordId: this.data.record.id };
    this._adAttempt = attempt;
    this.setData({ adWatching: true, adLoading: true, adError: '' });
    report(EVENTS.PREMIUM_AD_START, { testId: this.data.test.id, recordId: this.data.record.id });
    try {
      try {
        await videoAd.show();
      } catch (error) {
        if (!this.isCurrentAdAttempt(attempt)) return;
        await videoAd.load();
        if (!this.isCurrentAdAttempt(attempt)) return;
        await videoAd.show();
      }
    } catch (error) {
      if (!this.isCurrentAdAttempt(attempt)) return;
      this._adAttempt = null;
      console.error('激励视频广告显示失败', error);
      this.setData({
        adReady: false, adLoading: false, adWatching: false,
        adError: '广告暂时无法播放，请稍后再试。'
      });
      wx.showToast({ title: '广告暂时无法播放', icon: 'none' });
    }
  },
  completePremiumUnlock(recordId) {
    if (this._disposed || !this.data.record || recordId !== this.data.record.id) return;
    const receipt = premiumAccess.rememberCompletedGrant(recordId);
    this.setData({
      premiumUnlocked: true, premiumSavePending: true,
      premiumUnlockedAt: formatTime(receipt.completedAt), adError: ''
    });
    this.retryPremiumSave();
  },
  retryPremiumSave(options = {}) {
    if (this._disposed || !this.data.premiumSavePending || this.data.premiumSaving) return;
    this.setData({ premiumSaving: true });
    try {
      const updated = premiumAccess.persistPendingGrant(this.data.record.id);
      this.setData({
        premiumUnlocked: true,
        premiumUnlockedAt: formatTime(updated.premiumUnlockedAt),
        premiumSavePending: false, premiumSaving: false, premiumSaveError: '',
        adReady: false, adLoading: false, adError: ''
      });
      report(EVENTS.PREMIUM_UNLOCK, { testId: this.data.test.id, recordId: this.data.record.id });
      if (!options.silent) wx.showToast({ title: '深度报告已保存', icon: 'success' });
    } catch (error) {
      this.setData({
        premiumSaving: false,
        premiumSaveError: error.message || '存储空间暂时不可用，请恢复后重试保存。'
      });
    }
  },
  onUnload() {
    this._disposed = true;
    this._adAttempt = null;
    const videoAd = this._videoAd;
    this._videoAd = null;
    if (!videoAd) return;
    if (videoAd.offLoad && this._onAdLoad) videoAd.offLoad(this._onAdLoad);
    if (videoAd.offError && this._onAdError) videoAd.offError(this._onAdError);
    if (videoAd.offClose && this._onAdClose) videoAd.offClose(this._onAdClose);
    if (videoAd.destroy) videoAd.destroy();
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
