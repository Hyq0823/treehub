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
  relationshiprhythm: { symbol: '♡', title: '彼此靠近的节奏', note: '连接 · 表达 · 空间 · 认真回应' },
  friendshipstyle: { symbol: '✿', title: '你的友情配方', note: '相聚 · 体验 · 陪伴 · 小约定' },
  gentleboundaries: { symbol: '❧', title: '温柔也有自己的轮廓', note: '看见需要，慢慢练习说清楚' },
  emotionalrecharge: { symbol: '☼', title: '你的小小充电站', note: '找到此刻愿意试试的恢复入口' },
  cityvibe: { symbol: '⌂', title: '城市生活气质图', note: '节奏 · 连接 · 环境 · 探索 · 预算' },
  historicalecho: { symbol: '卷', title: '与古人的隔空回信', note: '穿越时间，找到一种生活共鸣' },
  lifepath: { symbol: '⌁', title: '你的生活路线图', note: '轨道与旷野，都可以由你定义' },
  hiddentalent: { symbol: '✧', title: '给天赋的一封邀请函', note: '从愿意做的小事，发现新的可能' },
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
  const profileMode = report.mode === 'profile';
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
        : profileMode ? `${item.left} ↔ ${item.right}` : `${preference} · 清晰度 ${clarity}%`
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
    basicDimensions: [], profileMode: false, profileDimensions: [], relatedTests: [], deepReport: null, premiumAvailable: false, rankingProfile: [],
    rankingGridWidth: 0, rankingLeadText: '', rankingTailText: '',
    premiumUnlocked: false, premiumUnlockedAt: '', adReady: false,
    adLoading: false, adWatching: false, adError: '',
    premiumSavePending: false, premiumSaving: false, premiumSaveError: '', comparison: null,
    premiumPage: 'portrait', themeId: '', themeHeroUrl: '', themeName: '', themeQuote: '', companionNames: '', themeStatus: '',
    starterReveal: false, starterClaimedNow: false, starterBusy: false, starterError: '',
    starterThemeId: '', starterThemes: [], starterCurrent: null, starterImages: {}, starterImage: '', starterShareImage: DEFAULT_SHARE_IMAGE,
    resultShareBusy: false, resultShareImage: '', resultShareError: '', resultShareNote: '',
    resultShareFormat: 'chat', resultShareChatReady: false
  },
  onLoad(options) {
    this._disposed = false;
    this._premiumAccessNeedsRefresh = false;
    this._comparisonNavigationRequest = 0;
    this._themeRequest = 0;
    this._starterShareCache = Object.create(null);
    this._resultShareCache = Object.create(null);
    this._resultShareRequest = (this._resultShareRequest || 0) + 1;
    this._resultShareContextKey = '';
    try {
      const test = require('../../data/test-loader.js').getTest(options.id);
      if (!test) {
        this.showState('missing', '没有找到这项测试', '回到探索大厅，选择一项感兴趣的测试。');
        return;
      }
      this._test = test;
      this.setData({
        test: { id: test.id, name: test.name, icon: test.icon },
        playful: test.scoring.strategy === 'profile' || ['sbti', 'shadow'].includes(test.id) || test.interaction && test.interaction.type === 'ranking', resultIcon: test.icon || '✦',
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
      const allRecords = archive.getRecords();
      const history = allRecords.filter(item => item.testId === test.id);
      const relatedTests = require('../../utils/test-recommendations.js').recommendTests(test.id, allRecords);
      const currentIndex = history.findIndex(item => item.id === record.id);
      const previous = currentIndex >= 0 ? history.slice(currentIndex + 1).find(item =>
        item.scoringVersion === record.scoringVersion && item.testVersion === record.testVersion) : null;
      const comparison = buildComparison(test, record, previous);
      this._comparisonPreviousId = comparison && previous ? previous.id : '';
      const pendingGrant = !record.premiumUnlockedAt && premiumAccess.getPendingGrant(record.id);
      const rankingProfile = Array.isArray(result.ranking) ? result.ranking : [];
      this.setData({
        record: { id: record.id, treeSnapshot: record.treeSnapshot || null, lifeContext: record.lifeContext || '' },
        result, savedAt: record.migrated || record.scoringVersion === 'legacy'
          ? '旧版导入 · 原测评时间未知' : formatTime(record.completedAt),
        legacy: record.scoringVersion !== SCORING_VERSION,
        basicDimensions: test.scoring.strategy === 'profile' ? [] : basicDimensions(result),
        profileMode: test.scoring.strategy === 'profile',
        profileDimensions: test.scoring.strategy === 'profile' && deepReport ? deepReport.dimensions : [],
        deepReport, comparison, relatedTests,
        resultShareBusy: false, resultShareImage: '', resultShareError: '', resultShareNote: '',
        resultShareFormat: 'chat', resultShareChatReady: false,
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
      this.prepareStarterReveal(allRecords);
      this.loadReportTheme(allRecords);
      if (deepReport && !record.premiumUnlockedAt && !pendingGrant) this.setupRewardedVideoAd();
      report(EVENTS.RESULT_VIEW, { testId: test.id, resultType: record.resultType });
    } catch (error) {
      this.showState('error', '暂时无法读取档案', error.message || '请稍后重试，设备中的记录不会被覆盖。');
    }
  },
  onShow() {
    if (this._disposed) return;
    this._comparisonHidden = false;
    this._openingComparison = false;
    this._comparisonNavigationRequest = (this._comparisonNavigationRequest || 0) + 1;
    const refreshed = this._premiumAccessNeedsRefresh ? this.refreshPremiumAccess() : true;
    if (refreshed && this.data.premiumSavePending) this.retryPremiumSave({ silent: true });
  },
  onHide() {
    this._comparisonHidden = true;
    this._premiumAccessNeedsRefresh = true;
    this._comparisonNavigationRequest = (this._comparisonNavigationRequest || 0) + 1;
  },
  refreshPremiumAccess(options = {}) {
    if (this._disposed || this.data.state !== 'ready' || !this.data.record || !this.data.record.id) return false;
    const recordId = this.data.record.id;
    let stored = null, message = '', invalidRecord = false;
    try {
      stored = archive.getRecord(recordId);
      if (!stored || stored.id !== recordId || stored.testId !== this.data.test.id) {
        stored = null;
        invalidRecord = true;
        message = '这份记录不在当前设备，请从档案重新打开。';
      } else if (stored.premiumUnlockedAt !== undefined &&
          (typeof stored.premiumUnlockedAt !== 'string' || !Number.isFinite(Date.parse(stored.premiumUnlockedAt)))) {
        stored = null;
        invalidRecord = true;
        message = '解锁记录暂时无法核验，请稍后重试。';
      }
    } catch (error) { message = '解锁状态暂时未能读取，请稍后重试；已有权益仍保留。'; }
    // A saved grant is sufficient. Do not read the smaller pending key again
    // when another report instance has already persisted these exact rights.
    if (stored && stored.premiumUnlockedAt) {
      this._premiumAccessNeedsRefresh = false;
      this.setData({ premiumUnlocked: true, premiumUnlockedAt: formatTime(stored.premiumUnlockedAt),
        premiumSavePending: false, premiumSaving: false, premiumSaveError: '', adError: '' });
      return true;
    }
    let pendingState;
    try { pendingState = premiumAccess.getPendingGrantState(recordId); }
    catch (error) { pendingState = { receipt: null, readable: false }; }
    const receipt = pendingState && pendingState.receipt;
    const completed = receipt && receipt.recordId === recordId && typeof receipt.completedAt === 'string' &&
      Number.isFinite(Date.parse(receipt.completedAt));
    if (completed && !invalidRecord) {
      // A completed view kept in memory stays usable even if storage cannot be
      // read. Persistence retries follow the existing completion-receipt flow.
      this._premiumAccessNeedsRefresh = false;
      this.setData({ premiumUnlocked: true, premiumUnlockedAt: formatTime(receipt.completedAt),
        premiumSavePending: true, adError: '' });
      return true;
    }
    if (!pendingState || pendingState.readable !== true) message = message || '解锁状态暂时未能读取，请稍后重试；已有权益仍保留。';
    if (message) {
      this._premiumAccessNeedsRefresh = true;
      this.setData({ adError: message });
      if (options.notify && !this.data.premiumUnlocked) wx.showToast({ title: '解锁状态未能读取，请重试', icon: 'none' });
      return false;
    }
    this._premiumAccessNeedsRefresh = false;
    if (this.data.adError) this.setData({ adError: '' });
    return true;
  },
  openComparison() {
    if (this._disposed || this._comparisonHidden || this._openingComparison || this.data.adWatching ||
        !this.data.comparison || !this.data.test.id || !this.data.record || !this.data.record.id) return;
    this._openingComparison = true;
    const request = this._comparisonNavigationRequest = (this._comparisonNavigationRequest || 0) + 1;
    const fail = () => {
      if (this._disposed || request !== this._comparisonNavigationRequest) return;
      this._openingComparison = false;
      if (!this._disposed && !this._comparisonHidden) wx.showToast({ title: '暂时未能打开，请再试一次', icon: 'none' });
    };
    try {
      wx.navigateTo({ url: `/packages/reports/compare/index?id=${encodeURIComponent(this.data.test.id)}&recordId=${encodeURIComponent(this.data.record.id)}` +
        (this._comparisonPreviousId ? `&previousRecordId=${encodeURIComponent(this._comparisonPreviousId)}` : ''), fail });
    } catch (error) { fail(); }
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
  prepareStarterReveal(records) {
    try {
      const themes = require('../../utils/themes.js');
      const state = themes.getState(records);
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
  resultShareSnapshot() {
    const dimensions = this.data.profileMode ? this.data.profileDimensions : this.data.basicDimensions;
    const portrait = this.data.result.portrait;
    return {
      recordId: this.data.record && this.data.record.id || '', testId: this.data.test.id || '',
      testName: this.data.test.name || '人格测试树', title: this.data.result.title || '这一次的我',
      tagline: this.data.result.tagline || this.data.result.summary || '', date: this.data.savedAt || '',
      themeId: this.data.themeId || '', heroUrl: this.data.themeHeroUrl || '', themeName: this.data.themeName || '',
      color: this._resultShareStyle && this._resultShareStyle.color || '#80a9de',
      pale: this._resultShareStyle && this._resultShareStyle.pale || '#eef5ff',
      symbol: this.data.resultIcon || '✦',
      mode: this.data.profileMode ? 'profile' : this.data.rankingProfile.length ? 'priority' : 'clarity',
      dimensions: (dimensions || []).map(item => ({ id: item.id, label: item.label, percent: item.percent, rank: item.rank })),
      keywords: portrait && portrait.keywords || [this.data.result.title || '本次探索', '允许自己慢慢改变']
    };
  },
  resultShareKey(snapshot = this.resultShareSnapshot(), format = 'chat') {
    return JSON.stringify([snapshot.recordId, snapshot.testId, snapshot.title, snapshot.tagline,
      snapshot.themeId, snapshot.heroUrl, snapshot.themeName, snapshot.color, snapshot.pale,
      snapshot.date, snapshot.mode, snapshot.dimensions, snapshot.keywords, format]);
  },
  resultShareNote(image) {
    return image && image.artFallback ? '主题图片暂未载入，已用简洁树形生成。可稍后重新制作。' : '';
  },
  selectResultShareFormat(event) {
    if (this._disposed || this.data.resultShareBusy) return;
    const format = event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.format;
    if (!['chat', 'portrait'].includes(format) || format === this.data.resultShareFormat) return;
    const image = this._resultShareCache && this._resultShareCache[this.resultShareKey(this.resultShareSnapshot(), format)];
    this.setData({ resultShareFormat: format, resultShareImage: image && image.path || '',
      resultShareError: '', resultShareNote: this.resultShareNote(image) });
  },
  refreshResultShareContext() {
    const key = this.resultShareKey();
    if (key === this._resultShareContextKey) return;
    const updated = !!this._resultShareContextKey && !!(this.data.resultShareBusy || this.data.resultShareImage);
    this._resultShareContextKey = key;
    this._resultShareRequest = (this._resultShareRequest || 0) + 1;
    const cache = this._resultShareCache || {};
    const cached = cache[this.resultShareKey(this.resultShareSnapshot(), this.data.resultShareFormat)];
    this.setData({ resultShareBusy: false, resultShareImage: cached && cached.path || '',
      resultShareChatReady: !!cache[key], resultShareError: '', resultShareNote: this.resultShareNote(cached) ||
        (updated && !cached ? '主题画面已更新，可以重新制作结果卡。' : '') });
  },
  async prepareResultShareCard(event = {}) {
    if (this._disposed || this.data.state !== 'ready' || this.data.adWatching || this.data.resultShareBusy) return;
    const snapshot = this.resultShareSnapshot();
    if (!snapshot.recordId || !snapshot.testId) return;
    const dataset = event.currentTarget && event.currentTarget.dataset || {};
    const selectedFormat = dataset.format || this.data.resultShareFormat;
    const format = ['chat', 'portrait'].includes(selectedFormat) ? selectedFormat : 'chat';
    const key = this.resultShareKey(snapshot, format);
    const force = !!dataset.force;
    this._resultShareCache = this._resultShareCache || Object.create(null);
    const cached = this._resultShareCache[key];
    if (cached && !force) {
      this.setData({ resultShareFormat: format, resultShareImage: cached.path, resultShareError: '',
        resultShareNote: this.resultShareNote(cached) });
      return;
    }
    const request = this._resultShareRequest = (this._resultShareRequest || 0) + 1;
    const isCancelled = () => this._disposed || request !== this._resultShareRequest ||
      key !== this.resultShareKey(this.resultShareSnapshot(), format);
    this.setData({ resultShareFormat: format, resultShareBusy: true, resultShareImage: '', resultShareError: '', resultShareNote: '' });
    try {
      // Both formats use only free summary dimensions. Drawing is loaded after
      // a tap; portrait exports never replace the 5:4 card used by WeChat chat.
      const image = await require('./result-share-card.js').buildResultShareCard(this,
        Object.assign({}, snapshot, { format, selector: '#resultShareCanvas', isCancelled }));
      if (isCancelled()) return;
      this._resultShareCache[key] = image;
      const keys = Object.keys(this._resultShareCache);
      if (keys.length > 4) delete this._resultShareCache[keys[0]];
      this.setData({ resultShareImage: image.path, resultShareChatReady: !!this._resultShareCache[this.resultShareKey()],
        resultShareNote: this.resultShareNote(image) });
    } catch (error) {
      if (!isCancelled()) this.setData({ resultShareError: error.message || '结果卡暂时未能生成，请稍后重试。' });
    } finally {
      if (!this._disposed && request === this._resultShareRequest) this.setData({ resultShareBusy: false });
    }
  },
  previewResultShareCard() {
    if (this._disposed || this.data.resultShareBusy) return;
    const cached = this._resultShareCache && this._resultShareCache[this.resultShareKey(this.resultShareSnapshot(), this.data.resultShareFormat)];
    if (cached && cached.path) wx.previewImage({ current: cached.path, urls: [cached.path] });
  },
  async loadReportTheme(records) {
    const request = ++this._themeRequest;
    try {
      const themes = require('../../utils/themes.js');
      const state = themes.getState(records);
      const current = state.catalog.find(item => item.id === state.selectedId);
      if (!current || current.hidden && !current.discovered) return;
      const changed = this.data.themeId !== current.id;
      this._resultShareStyle = { color: current.color, pale: current.pale };
      this.setData({ themeId: current.id, themeName: current.name, themeQuote: current.quote,
        themeHeroUrl: changed ? '' : this.data.themeHeroUrl,
        companionNames: current.companions.map(item => item.name).join('与'),
        themeStatus: current.unlocked ? '已收藏' : '主题预览' });
      this.refreshResultShareContext();
      const url = await require('../../utils/theme-assets.js').resolveThemeAsset(current.id);
      if (!this._disposed && request === this._themeRequest) {
        this.setData({ themeHeroUrl: url || '' });
        this.refreshResultShareContext();
      }
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
    if (this._disposed || this._comparisonHidden || !this.data.premiumAvailable || this.data.adWatching) return;
    // Comparison can open another instance of this report. Recheck the exact
    // record before starting a video so a newly saved grant never needs replay.
    if (!this.refreshPremiumAccess({ notify: true })) return;
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
    this._resultShareRequest = (this._resultShareRequest || 0) + 1;
    this._resultShareCache = null;
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
  openRelatedTest(event) {
    if (this._disposed || this._openingRelated || this.data.adWatching) return;
    const id = event.currentTarget.dataset.id;
    if (!(this.data.relatedTests || []).some(item => item.id === id)) return;
    // Drafts are read only after a tap. Let the detail page offer an explicit
    // resume/restart choice; a fresh exploration keeps the short ordinary flow.
    const hasDraft = require('../../utils/answer-drafts.js').hasPendingDraft(id);
    const url = hasDraft ? `/pages/test-detail/index?id=${encodeURIComponent(id)}`
      : `/pages/test-answer/index?id=${encodeURIComponent(id)}&context=ordinary`;
    // Replace this report instead of stacking another detail/answer pair.
    this._openingRelated = true;
    wx.redirectTo({
      url,
      fail: () => {
        this._openingRelated = false;
        if (!this._disposed) wx.showToast({ title: '暂时未能打开，请再试一次', icon: 'none' });
      }
    });
  },
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
    const profileTitles = {
      cityvibe: `我的城市生活气质是「${this.data.result.title}」，你向往哪种日常？`,
      friendshipstyle: `我是「${this.data.result.title}」，你的友情配方是什么？`,
      relationshiprhythm: `我的相处节奏是「${this.data.result.title}」，你呢？`,
      gentleboundaries: `温柔也有边界｜我的结果是「${this.data.result.title}」`,
      emotionalrecharge: `我是「${this.data.result.title}」，你的充电入口是什么？`,
      historicalecho: `我与「${this.data.result.title}」有点像，你会遇见哪位古人？`,
      lifepath: `我的生活路线是「${this.data.result.title}」，你更靠近轨道还是旷野？`,
      hiddentalent: `我的隐藏偏好是「${this.data.result.title}」，你愿意试试哪种可能？`
    };
    const firstPriority = this.data.rankingProfile && this.data.rankingProfile[0];
    const resultCard = this._resultShareCache && this._resultShareCache[this.resultShareKey()];
    return {
      title: profileTitles[this.data.test.id] || (firstPriority ? `${this.data.rankingProfile.length}件事一起发生，我先保护「${firstPriority.label}」｜你会怎么排？` :
        `${this.data.test.name || '人格测试树'} · 一起探索自己的另一面`),
      path: this.data.test.id ? `/pages/test-detail/index?id=${encodeURIComponent(this.data.test.id)}` : '/pages/test-hall/index',
      imageUrl: resultCard && resultCard.path || DEFAULT_SHARE_IMAGE
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
