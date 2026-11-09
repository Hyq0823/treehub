const { report, EVENTS } = require('../../utils/track.js');
const archive = require('../../utils/archive.js');
const { resolveReport, SCORING_VERSION } = require('../../utils/scoring.js');
const { buildDeepReport, basicDimensions, buildComparison } = require('./deep-report.js');
const { rewardedReport: REWARDED_AD_UNIT_ID } = require('./ads.js');
const { createRewardedVideo } = require('./rewarded-video.js');
const premiumAccess = require('./premium-access.js');
const { DEFAULT_SHARE_IMAGE, buildShareCard } = require('../../utils/share-card.js');

const RESULT_VISUALS = {
  mbti: { symbol: '✦', title: '四维偏好星图', note: '能量 · 感知 · 决策 · 节奏' },
  bigfive: { symbol: '❋', title: '五维特质花冠', note: '开放 · 尽责 · 外向 · 宜人 · 情绪感受' },
  enneagram: { symbol: '✺', title: '内在动力罗盘', note: '看见此刻最先推动你的内在方向' },
  ie: { symbol: '◐', title: '社交能量光谱', note: '连接世界，也照顾自己的充电节奏' },
  sbti: { symbol: '◈', title: '趣味人格徽章', note: '把有趣的这一面，收藏进今天' },
  shadow: { symbol: '☾', title: '月影反应镜', note: '看看压力时更常出现的保护方式' },
  firstreaction: { symbol: '✦', title: '第一反应优先图', note: '先保护什么 · 最后才顾到什么' }
};

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function decorateDeepReport(report) {
  if (!report) return null;
  const rankingMode = report.mode === 'ranking';
  const dimensions = (report.dimensions || []).map(item => {
    const percent = Math.max(0, Math.min(100, Number(item.percent) || 0));
    const clarity = Math.round(Math.abs(percent - 50) * 2);
    const preference = percent > 60 ? item.right : percent < 40 ? item.left : '相对均衡';
    return Object.assign({}, item, {
      percent, clarity,
      preference,
      tone: percent > 60 ? 'right' : percent < 40 ? 'left' : 'middle',
      legendText: rankingMode && Number.isInteger(item.rank)
        ? `第 ${item.rank} 顺位 · 本次相对优先度 ${percent}%`
        : `${preference} · 清晰度 ${clarity}%`
    });
  });
  const ranked = dimensions.slice().sort((first, second) => rankingMode
    ? first.rank - second.rank : second.clarity - first.clarity);
  const icons = ['✦', '❧', '◐', '◇', '◎'];
  const timing = ['今天', '7 天内', '30 天后'];
  return Object.assign({}, report, {
    dimensions,
    highlights: ranked.slice(0, Math.min(3, ranked.length)).map(item => Object.assign({}, item, {
      highlightText: rankingMode ? `${item.label} · 第 ${item.rank} 顺位` : item.preference
    })),
    balancedCount: rankingMode ? 0 : dimensions.filter(item => item.tone === 'middle').length,
    sections: (report.sections || []).map((section, index) => Object.assign({ icon: icons[index % icons.length] }, section)),
    actionPlan: (report.actions || []).map((content, index) => ({ timing: timing[index] || `第 ${index + 1} 步`, content }))
  });
}

Page({
  data: {
    test: {}, result: {}, record: null, savedAt: '', state: 'loading',
    stateTitle: '', stateMessage: '', legacy: false, playful: false, resultIcon: '✦', resultVisual: RESULT_VISUALS.mbti,
    basicDimensions: [], deepReport: null, premiumAvailable: false, rankingProfile: [],
    rankingGridWidth: 0, rankingLeadText: '', rankingTailText: '',
    premiumUnlocked: false, premiumUnlockedAt: '', adReady: false,
    adLoading: false, adWatching: false, adError: '',
    premiumSavePending: false, premiumSaving: false, premiumSaveError: '', comparison: null,
    premiumPage: 'portrait', themeId: '', themeHeroUrl: '', themeName: '', themeQuote: '', companionNames: '', themeStatus: '',
    starterReveal: false, starterClaimedNow: false, starterBusy: false, starterError: '',
    starterThemeId: '', starterThemes: [], starterCurrent: null, starterImages: {}, starterImage: '', starterShareImage: DEFAULT_SHARE_IMAGE
  },
  onLoad(options) {
    this._disposed = false;
    this._themeRequest = 0;
    this._starterShareCache = Object.create(null);
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
        playful: ['sbti', 'shadow'].includes(test.id) || test.interaction && test.interaction.type === 'ranking', resultIcon: test.icon || '✦',
        resultVisual: RESULT_VISUALS[test.id] || { symbol: test.icon || '✦', title: '本次人格画像', note: '收藏这一次认真回答的自己' }
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
      const deepReport = decorateDeepReport(buildDeepReport(test, record, result));
      const history = archive.getRecords(test.id);
      const currentIndex = history.findIndex(item => item.id === record.id);
      const previous = currentIndex >= 0 ? history.slice(currentIndex + 1).find(item =>
        item.scoringVersion === record.scoringVersion && item.testVersion === record.testVersion) : null;
      const comparison = buildComparison(test, record, previous);
      const pendingGrant = !record.premiumUnlockedAt && premiumAccess.getPendingGrant(record.id);
      const rankingProfile = Array.isArray(result.ranking) ? result.ranking : [];
      this.setData({
        record: { id: record.id, treeSnapshot: record.treeSnapshot || null, lifeContext: record.lifeContext || '' },
        result, savedAt: record.migrated || record.scoringVersion === 'legacy'
          ? '旧版导入 · 原测评时间未知' : formatTime(record.completedAt),
        legacy: record.scoringVersion !== SCORING_VERSION,
        basicDimensions: basicDimensions(result), deepReport, comparison,
        rankingProfile,
        rankingGridWidth: rankingProfile.length * 108,
        rankingLeadText: rankingProfile.length ? result.rankingMode === 'aggregate'
          ? `综合上更优先「${rankingProfile[0].label}」` : `你先保护「${rankingProfile[0].label}」` : '',
        rankingTailText: rankingProfile.length ? result.rankingMode === 'aggregate'
          ? `综合相对靠后的是「${rankingProfile[rankingProfile.length - 1].label}」`
          : `这次排在最后的是「${rankingProfile[rankingProfile.length - 1].label}」` : '',
        premiumAvailable: !!deepReport,
        premiumUnlocked: !!record.premiumUnlockedAt || !!pendingGrant,
        premiumUnlockedAt: record.premiumUnlockedAt ? formatTime(record.premiumUnlockedAt) :
          pendingGrant ? formatTime(pendingGrant.completedAt) : '',
        premiumSavePending: !!pendingGrant,
        state: 'ready'
      });
      this.loadResultAssets(result, rankingProfile);
      this.prepareStarterReveal();
      this.loadReportTheme();
      if (deepReport && !record.premiumUnlockedAt && !pendingGrant) this.setupRewardedVideoAd();
      report(EVENTS.RESULT_VIEW, { testId: test.id, resultType: record.resultType });
    } catch (error) {
      this.showState('error', '暂时无法读取档案', error.message || '请稍后重试，设备中的记录不会被覆盖。');
    }
  },
  onShow() {
    if (!this._disposed && this.data.premiumSavePending) this.retryPremiumSave({ silent: true });
  },
  async loadResultAssets(result, rankingProfile) {
    const paths = Array.from(new Set([result && result.assetPath].concat(
      (rankingProfile || []).map(item => item.assetPath)
    ).filter(Boolean)));
    if (!paths.length) return;
    const request = this._reportAssetRequest = (this._reportAssetRequest || 0) + 1;
    try {
      const urls = await require('../../utils/public-assets.js').resolvePublicAssets(paths);
      if (this._disposed || request !== this._reportAssetRequest) return;
      const nextResult = Object.assign({}, this.data.result);
      if (nextResult.assetPath && urls[nextResult.assetPath]) nextResult.image = urls[nextResult.assetPath];
      const nextProfile = (this.data.rankingProfile || []).map(item => item.assetPath && urls[item.assetPath]
        ? Object.assign({}, item, { image: urls[item.assetPath] }) : item);
      this.setData({ result: nextResult, rankingProfile: nextProfile });
    } catch (error) { /* The report keeps its lightweight icon placeholder. */ }
  },
  prepareStarterReveal() {
    try {
      const themes = require('../../utils/themes.js');
      const state = themes.getState();
      if (state.starterClaimed || state.uniqueCount < 1) return;
      const starterThemes = state.catalog.filter(item => item.starter && item.id === state.recommendation).map(item => ({
        id: item.id, name: item.name, quote: item.quote, description: item.description,
        color: item.color, pale: item.pale, tags: item.tags, companions: item.companions,
        recommended: item.id === state.recommendation
      }));
      const selected = starterThemes.find(item => item.recommended) || starterThemes[0];
      if (!selected) return;
      this.setData({ starterReveal: true, starterThemes, starterCurrent: selected, starterThemeId: selected.id, starterClaimedNow: false, starterError: '' });
      this.loadStarterAssets(starterThemes);
    } catch (error) {
      // A theme reveal cannot prevent access to the saved report.
    }
  },
  async loadStarterAssets(starterThemes) {
    const request = this._starterRequest = (this._starterRequest || 0) + 1;
    const themeAssets = require('../../utils/theme-assets.js');
    const pairs = await Promise.all(starterThemes.map(async item => {
      try { return [item.id, await themeAssets.resolveThemeAsset(item.id)]; }
      catch (error) { return [item.id, '']; }
    }));
    if (this._disposed || request !== this._starterRequest) return;
    const starterImages = Object.fromEntries(pairs);
    this.setData({ starterImages, starterImage: starterImages[this.data.starterThemeId] || '' });
    const current = starterThemes.find(item => item.id === this.data.starterThemeId);
    if (current && starterImages[current.id]) this.scheduleStarterShare(current, starterImages[current.id]);
  },
  scheduleStarterShare(theme, heroUrl) {
    if (this._disposed || !this.data.starterReveal || !theme || !heroUrl) return;
    const key = `${theme.id}:${heroUrl}`;
    const cached = this._starterShareCache && this._starterShareCache[key];
    if (cached) {
      if (this.data.starterThemeId === theme.id && this.data.starterShareImage !== cached) {
        this.setData({ starterShareImage: cached });
      }
      return;
    }
    if (this._starterShareKey === key && (this._starterShareTimer || this._starterShareBuilding)) return;
    this.cancelStarterShareTimer();
    this._starterShareKey = key;
    // Sharing is optional. Keep Canvas work out of the report's first paint and
    // fall back to the bundled 5:4 cover when someone shares immediately.
    this._starterShareTimer = setTimeout(() => {
      this._starterShareTimer = null;
      if (this._disposed || !this.data.starterReveal || this.data.starterThemeId !== theme.id) return;
      this.prepareStarterShare(theme, heroUrl, key);
    }, 1500);
  },
  cancelStarterShareTimer(invalidate = false) {
    if (this._starterShareTimer) clearTimeout(this._starterShareTimer);
    this._starterShareTimer = null;
    if (invalidate) {
      this._starterShareRequest = (this._starterShareRequest || 0) + 1;
      this._starterShareBuilding = '';
      this._starterShareKey = '';
    }
  },
  async prepareStarterShare(theme, heroUrl, cacheKey = `${theme.id}:${heroUrl}`) {
    if (this._disposed || this._starterShareBuilding === cacheKey) return;
    const request = this._starterShareRequest = (this._starterShareRequest || 0) + 1;
    this._starterShareBuilding = cacheKey;
    try {
      const starterShareImage = await buildShareCard(this, {
        selector: '#starterShareCanvas', heroUrl, title: theme.name,
        subtitle: theme.quote, pale: theme.pale, color: theme.color
      });
      if (this._disposed || request !== this._starterShareRequest) return;
      this._starterShareCache[cacheKey] = starterShareImage;
      if (this.data.starterThemeId === theme.id) this.setData({ starterShareImage });
    } catch (error) {
      // The bundled 5:4 cover remains available if Canvas is not ready.
    } finally {
      if (this._starterShareBuilding === cacheKey) this._starterShareBuilding = '';
    }
  },
  claimStarterTheme() {
    if (this.data.starterBusy || this.data.starterClaimedNow || !this.data.starterThemeId) return;
    this.setData({ starterBusy: true, starterError: '' });
    try {
      require('../../utils/themes.js').claimStarter(this.data.starterThemeId);
      this.setData({ starterBusy: false, starterClaimedNow: true });
      this.loadReportTheme();
    } catch (error) {
      this.setData({ starterBusy: false, starterError: error.message || '树与伙伴暂时未能收藏，请重试。' });
    }
  },
  closeStarterReveal() { this.cancelStarterShareTimer(true); this.setData({ starterReveal: false }); },
  openStarterTree() { this.cancelStarterShareTimer(true); this.setData({ starterReveal: false }); wx.switchTab({ url: '/pages/my-tree/index' }); },
  async loadReportTheme() {
    const request = ++this._themeRequest;
    try {
      const themes = require('../../utils/themes.js');
      const state = themes.getState();
      const current = state.catalog.find(item => item.id === state.selectedId);
      if (!current || current.hidden && !current.discovered) return;
      this.setData({ themeId: current.id, themeName: current.name, themeQuote: current.quote,
        companionNames: current.companions.map(item => item.name).join('与'),
        themeStatus: current.unlocked ? '已收藏' : '主题预览' });
      const url = await require('../../utils/theme-assets.js').resolveThemeAsset(current.id);
      if (!this._disposed && request === this._themeRequest) this.setData({ themeHeroUrl: url || '' });
    } catch (error) {
      // A theme asset cannot prevent access to an already saved report.
    }
  },
  showState(state, title, message) {
    this.setData({ state, stateTitle: title, stateMessage: message });
  },
  setupRewardedVideoAd() {
    if (this._disposed || this._rewardedVideo) return;
    // The controller belongs to this page, while the native ad is managed for
    // the app session. Creating the controller does not preload an ad.
    this._rewardedVideo = createRewardedVideo({
      adUnitId: REWARDED_AD_UNIT_ID,
      onState: state => {
        if (this._disposed) return;
        const changes = {};
        if (state.busy !== undefined) {
          changes.adWatching = state.busy;
          changes.adLoading = state.busy && state.ready !== true;
        }
        if (state.ready !== undefined) changes.adReady = state.ready;
        if (state.error !== undefined) changes.adError = state.error;
        this.setData(changes);
      },
      onComplete: recordId => this.completePremiumUnlock(recordId),
      onPartial: () => wx.showToast({ title: '完整看完视频即可解锁', icon: 'none' }),
      onError: error => {
        console.error('激励视频广告播放失败', error);
        wx.showToast({ title: '广告暂时无法播放，请稍后再试', icon: 'none' });
      }
    });
  },
  async showPremiumAd() {
    if (this._disposed || !this.data.premiumAvailable || this.data.adWatching) return;
    if (this.data.premiumSavePending) {
      this.retryPremiumSave();
      return;
    }
    if (this.data.premiumUnlocked) return;
    if (!wx.createRewardedVideoAd) {
      wx.showModal({ title: '暂时无法播放', content: '当前环境暂不支持激励视频，请在手机微信中重试。', showCancel: false });
      return;
    }
    this.setupRewardedVideoAd();
    report(EVENTS.PREMIUM_AD_START, { testId: this.data.test.id, recordId: this.data.record.id });
    await this._rewardedVideo.play(this.data.record.id);
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
  selectPremiumPage(event) {
    const page = event.currentTarget.dataset.page;
    if (['portrait', 'insights', 'actions'].includes(page)) this.setData({ premiumPage: page });
  },
  onUnload() {
    this._disposed = true;
    this._reportAssetRequest = (this._reportAssetRequest || 0) + 1;
    this.cancelStarterShareTimer(true);
    this._themeRequest++;
    this._starterRequest = (this._starterRequest || 0) + 1;
    if (this._rewardedVideo) this._rewardedVideo.dispose();
  },
  retakeTest() {
    if (!this.data.test.id) return;
    wx.redirectTo({ url: `/pages/test-detail/index?id=${encodeURIComponent(this.data.test.id)}` });
  },
  goToHome() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  goToArchive() { wx.switchTab({ url: '/pages/user-center/index' }); },
  goToTree() { wx.switchTab({ url: '/pages/my-tree/index' }); },
  instrumentShare() {
    report(EVENTS.SHARE_TAP, { testId: this.data.test.id || '', resultType: this.data.result.type || '' });
  },
  onShareAppMessage(options = {}) {
    this.instrumentShare();
    if (options.target && options.target.dataset && options.target.dataset.kind === 'starter') {
      const theme = this.data.starterThemes.find(item => item.id === this.data.starterThemeId);
      if (theme) return {
        title: `${theme.name}｜这是我的第一棵人格树`,
        path: `/pages/my-tree/index?theme=${encodeURIComponent(theme.id)}`,
        imageUrl: this.data.starterShareImage || DEFAULT_SHARE_IMAGE
      };
    }
    const firstPriority = this.data.rankingProfile && this.data.rankingProfile[0];
    return {
      title: firstPriority ? `${this.data.rankingProfile.length}件事一起发生，我先保护「${firstPriority.label}」｜你会怎么排？` :
        this.data.comparison ? `${this.data.comparison.currentLabel}，我真的有些变了` : `${this.data.test.name || '人格测试树'} · 一起探索自己的另一面`,
      path: this.data.test.id ? `/pages/test-detail/index?id=${encodeURIComponent(this.data.test.id)}` : '/pages/test-hall/index',
      imageUrl: DEFAULT_SHARE_IMAGE
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
