const { report, EVENTS } = require('../../utils/track.js');
const archive = require('../../utils/archive.js');
const { getTree } = require('../../utils/personality-tree.js');
const display = require('../../data/exploration.js');
const themes = require('../../utils/themes.js');
const { getTheme } = require('../../data/themes.js');
const themeAssets = require('../../utils/theme-assets.js');
const { DEFAULT_SHARE_IMAGE, buildShareCard } = require('../../utils/share-card.js');
const { catalog, resolveResultTitle } = require('../../data/test-catalog.js');
const { getRecentExploration } = require('../../utils/recent-exploration.js');
const CARD_THEMES = { firstreaction: 'adventurer', cityvibe: 'wanderer', relationshiprhythm: 'romantic', friendshipstyle: 'listener', gentleboundaries: 'listener', emotionalrecharge: 'moon', historicalecho: 'romantic', lifepath: 'wanderer', hiddentalent: 'collector', mbti: 'adventurer', bigfive: 'collector', enneagram: 'romantic', ie: 'observer', sbti: 'dreamer', shadow: 'moon' };
const DISPLAY_ORDER = ['firstreaction', 'cityvibe', 'relationshiprhythm', 'friendshipstyle', 'gentleboundaries', 'emotionalrecharge', 'historicalecho', 'lifepath', 'hiddentalent', 'mbti', 'bigfive', 'enneagram', 'ie', 'sbti', 'shadow'];

function buildGreeting(uniqueCount) {
  const hour = new Date().getHours();
  const day = Math.floor(Date.now() / 86400000);
  if (!uniqueCount) return { lead: '你好，', title: '从一份好奇开始认识自己', note: '第一片探索叶，正在等你点亮。' };
  const moments = hour < 11 ? [
    ['早上好，', '今天想从哪里认识自己？', '带着清醒，也带着一点好奇出发。'],
    ['新的一天，', '先听听此刻真实的自己', '每次回答，都会留下新的年轮。']
  ] : hour < 18 ? [
    ['下午好，', '给自己两分钟慢下来', '看看今天的你，和上次有什么不同。'],
    ['见到你啦，', '来收集今天的自己', '新的探索，也许会长出新的伙伴。']
  ] : [
    ['晚上好，', '把今天的感受留给自己', '慢慢回答，也是在认真照顾自己。'],
    ['欢迎回来，', '看看此刻的你变了吗？', '今晚的答案，会成为新的年轮。']
  ];
  const [lead, title, note] = moments[(day + uniqueCount) % moments.length];
  return { lead, title, note };
}

Page({
  data: {
    categories: display.categories, category: 'all', cards: [], filteredCards: [], filterOpen: false, cardImagesFailed: false,
    tree: null, leaves: [], recommendation: null, recentExploration: null, error: '',
    themeId: 'adventurer', themeName: '柔软的冒险家', themeImage: '',
    themeColor: '#318aff', themePale: '#e9f5ff',
    artState: 'loading', rewardTitle: '', rewardTargetTestId: '', rewardReady: false, shareImagePath: DEFAULT_SHARE_IMAGE,
    greetingLead: '你好，', greetingTitle: '从一份好奇开始认识自己', greetingNote: '第一片探索叶，正在等你点亮。'
  },
  onLoad() { report(EVENTS.HALL_VIEW); },
  onShow() {
    this._hidden = false;
    this._recentOpening = false;
    this._cardAttempts = new Map();
    this._failedCardIds = this._hiddenCardFailures || new Set();
    this._hiddenCardFailures = new Set();
    if (this.data.cardImagesFailed !== !!this._failedCardIds.size) this.setData({ cardImagesFailed: !!this._failedCardIds.size });
    require('../../utils/tab-bar.js').syncTabBar(this, '/pages/test-hall/index');
    this.loadTests();
    const observe = () => { if (!this._hidden) this.setupCardObserver(); };
    if (wx.nextTick) wx.nextTick(observe); else observe();
  },
  loadTests() {
    try {
      const state = archive.getArchive();
      const tree = getTree(state, catalog);
      let themeId = 'adventurer';
      let themeState = null;
      try { themeState = themes.getState(state.records); themeId = themeState.selectedId || themeId; } catch (error) {}
      const theme = getTheme(themeId);
      const displayRank = id => DISPLAY_ORDER.includes(id) ? DISPLAY_ORDER.indexOf(id) : DISPLAY_ORDER.length;
      const orderedCatalog = catalog.slice().sort((first, second) => displayRank(first.id) - displayRank(second.id));
      const recordsByTest = new Map();
      state.records.forEach(record => {
        if (!recordsByTest.has(record.testId)) recordsByTest.set(record.testId, []);
        recordsByTest.get(record.testId).push(record);
      });
      const cards = orderedCatalog.map((test, index) => {
        const records = recordsByTest.get(test.id) || [];
        const latest = records[0];
        const metadata = display.tests[test.id] || {
          title: test.name, category: 'personality', prompt: test.description,
          symbol: '✦', art: 'facets', color: '#488d7a'
        };
        let resultTitle = '';
        if (latest) {
          resultTitle = resolveResultTitle(test.id, latest) || '早期记录 · 可重新探索';
        }
        return Object.assign({}, metadata, {
          id: test.id, number: String(index + 1).padStart(2, '0'), questionsCount: test.questionsCount, time: test.time,
          count: records.length, collected: !!latest, recordId: latest && latest.id,
          quickStart: !!metadata.quickStart,
          artThemeId: CARD_THEMES[test.id] || 'adventurer',
          image: this._cardImages && this._cardImages[test.id] || metadata.image || '',
          localImage: metadata.image || '',
          assetPath: metadata.assetPath || '',
          resultTitle
        });
      });
      const recommendation = cards.find(t => !t.collected) || null;
      const greeting = buildGreeting(tree.uniqueCount);
      const nextUnlock = themeState && themeState.nextUnlock;
      const allThemesOwned = themeState && Array.isArray(themeState.catalog) && themeState.catalog.length && themeState.catalog.every(item => item.unlocked);
      const rewardTitle = !tree.uniqueCount ? '首测完成，领取树与伙伴' : nextUnlock
        ? nextUnlock.remaining === 0 ? nextUnlock.hint || `回看报告，领取「${nextUnlock.name}」`
          : nextUnlock.targetTestId ? nextUnlock.hint : `再探索 ${nextUnlock.remaining} 项，长出「${nextUnlock.name}」`
        : allThemesOwned ? '主题已收齐，新的探索继续长叶片' : '新探索长叶片，复测留年轮';
      this.setData({
        tree, cards, recommendation, recentExploration: getRecentExploration(state.records), error: '', themeId,
        themeName: theme && theme.name || '我的成长小世界',
        themeColor: theme && theme.color || '#318aff', themePale: theme && theme.pale || '#e9f5ff',
        rewardTitle, rewardTargetTestId: nextUnlock && nextUnlock.targetTestId || '', rewardReady: !!(nextUnlock && nextUnlock.remaining === 0),
        greetingLead: greeting.lead, greetingTitle: greeting.title, greetingNote: greeting.note,
        leaves: cards.slice(0, 8).map((card, index) => ({ id: card.id, collected: index < tree.uniqueCount })),
        moreLeafCount: Math.max(0, cards.length - 8),
        filteredCards: this.data.category === 'all' ? cards : cards.filter(c => c.category === this.data.category)
      });
      this.loadThemeImage(themeId);
    } catch (error) {
      this.setData({ error: '暂时无法读取本机档案。请重试，你的记录不会被自动覆盖。' });
    }
  },
  loadThemeImage(themeId) {
    if (this._loadedThemeId === themeId && this._loadedThemeUrl) {
      const changes = {};
      if (this.data.themeImage !== this._loadedThemeUrl) changes.themeImage = this._loadedThemeUrl;
      if (this.data.artState !== 'ready') changes.artState = 'ready';
      if (Object.keys(changes).length) this.setData(changes);
      this.scheduleThemeShare(themeId, this._loadedThemeUrl);
      return;
    }
    const request = this._themeAssetRequest = (this._themeAssetRequest || 0) + 1;
    this.setData({ themeImage: '', artState: 'loading', shareImagePath: DEFAULT_SHARE_IMAGE });
    Promise.resolve(themeAssets.resolveThemeAsset(themeId)).then(url => {
      if (this._hidden || request !== this._themeAssetRequest) return;
      this._loadedThemeId = url ? themeId : '';
      this._loadedThemeUrl = url || '';
      this.setData({ themeImage: url || '', artState: url ? 'ready' : 'unavailable' });
      if (url) this.scheduleThemeShare(themeId, url);
    }).catch(() => {
      if (!this._hidden && request === this._themeAssetRequest) this.setData({ artState: 'unavailable' });
    });
  },
  scheduleThemeShare(themeId, heroUrl) {
    if (this._shareTimer) clearTimeout(this._shareTimer);
    this._shareTimer = null;
    const cached = this._shareCard;
    if (cached && cached.themeId === themeId && cached.heroUrl === heroUrl) {
      if (this.data.shareImagePath !== cached.path) this.setData({ shareImagePath: cached.path });
      return;
    }
    this._shareTimer = setTimeout(() => {
      this._shareTimer = null;
      if (this._hidden || this.data.themeId !== themeId || this.data.themeImage !== heroUrl) return;
      this.prepareThemeShare(themeId, heroUrl);
    }, 1500);
  },
  async prepareThemeShare(themeId, heroUrl) {
    const cached = this._shareCard;
    if (cached && cached.themeId === themeId && cached.heroUrl === heroUrl) {
      if (!this._hidden && this.data.shareImagePath !== cached.path) this.setData({ shareImagePath: cached.path });
      return;
    }
    const request = this._shareRequest = (this._shareRequest || 0) + 1;
    const theme = getTheme(themeId);
    if (!theme || !heroUrl) return;
    try {
      const shareImagePath = await buildShareCard(this, {
        selector: '#hallShareCanvas', heroUrl, title: theme.name,
        subtitle: '探索不同的测试，遇见更多面的自己', pale: theme.pale, color: theme.color
      });
      if (request !== this._shareRequest) return;
      this._shareCard = { themeId, heroUrl, path: shareImagePath };
      if (!this._hidden && this.data.themeId === themeId) this.setData({ shareImagePath });
    } catch (error) { /* Keep the bundled 5:4 share cover. */ }
  },
  setupCardObserver() {
    if (this._cardObserver) this._cardObserver.disconnect();
    this._cardObserver = null;
    if (!this.createIntersectionObserver) return;
    const observer = this.createIntersectionObserver({ observeAll: true });
    this._cardObserver = observer;
    observer.relativeToViewport({ bottom: 160 }).observe('.test-art', entry => {
      if (!this._hidden && entry && entry.intersectionRatio > 0 && entry.dataset) this.loadCardImage(entry.dataset.id);
    });
  },
  loadCardImage(testId) {
    if (this._hidden) return;
    const card = this.data.cards.find(item => item.id === testId);
    if (!card || card.image && !card.assetPath) return;
    if (this._cardAttempts && (this._cardAttempts.get(testId) || 0) >= 2) return;
    this._cardImages = this._cardImages || {};
    this._cardPending = this._cardPending || new Set();
    this._cardQueue = this._cardQueue || new Set();
    if (this._cardImages[testId] || this._cardPending.has(testId) || this._cardQueue.has(testId)) return;
    this._cardQueue.add(testId);
    if (this._cardFlushScheduled) return;
    this._cardFlushScheduled = true;
    const flushToken = this._cardFlushToken = (this._cardFlushToken || 0) + 1;
    const generation = this._cardGeneration || 0;
    Promise.resolve().then(() => {
      if (flushToken !== this._cardFlushToken) return;
      this._cardFlushScheduled = false;
      if (this._hidden || generation !== (this._cardGeneration || 0)) {
        this._cardQueue.clear();
        return;
      }
      const ids = Array.from(this._cardQueue);
      this._cardQueue.clear();
      this.flushCardImages(ids, generation);
    });
  },
  async flushCardImages(testIds, generation) {
    const pending = this._cardPending = this._cardPending || new Set();
    const attempts = this._cardAttempts = this._cardAttempts || new Map();
    const cards = testIds.map(id => this.data.cards.find(item => item.id === id)).filter(card =>
      card && (card.assetPath || !card.image) && !this._cardImages[card.id] && !pending.has(card.id) && (attempts.get(card.id) || 0) < 2);
    if (!cards.length) return;
    cards.forEach(card => { pending.add(card.id); attempts.set(card.id, (attempts.get(card.id) || 0) + 1); });
    try {
      const publicAssets = require('../../utils/public-assets.js');
      const themeIds = Array.from(new Set(cards.filter(card => !card.assetPath).map(card => card.artThemeId)));
      const assetPaths = Array.from(new Set(cards.map(card => card.assetPath).filter(Boolean)));
      const [themeUrls, publicUrls] = await Promise.all([
        themeIds.length ? themeAssets.resolveThemeAssets(themeIds) : {},
        assetPaths.length ? publicAssets.resolvePublicAssets(assetPaths) : {}
      ]);
      if (this._hidden || generation !== (this._cardGeneration || 0)) return;
      let changed = false;
      cards.forEach(card => {
        const url = card.assetPath ? publicUrls[card.assetPath] : themeUrls[card.artThemeId];
        if (!url) { this.markCardImageFailed(card.id); return; }
        this._cardImages[card.id] = url;
        changed = true;
      });
      if (!changed) return;
      const next = this.data.cards.map(item => this._cardImages[item.id]
        ? Object.assign({}, item, { image: this._cardImages[item.id] }) : item);
      this.setData({ cards: next, filteredCards: this.data.category === 'all' ? next : next.filter(item => item.category === this.data.category) });
    } catch (error) {
      if (!this._hidden && generation === (this._cardGeneration || 0)) cards.forEach(card => this.markCardImageFailed(card.id));
    } finally {
      cards.forEach(card => pending.delete(card.id));
    }
  },
  retryThemeImage() {
    themeAssets.invalidateThemeAsset(this.data.themeId);
    this._loadedThemeId = '';
    this._loadedThemeUrl = '';
    this.loadThemeImage(this.data.themeId);
  },
  themeImageFailed(event) {
    if (event.currentTarget.dataset.theme === this.data.themeId) {
      themeAssets.invalidateThemeAsset(this.data.themeId);
      this._loadedThemeId = '';
      this._loadedThemeUrl = '';
      this.setData({ themeImage: '', artState: 'unavailable' });
    }
  },
  cardImageFailed(event) {
    if (this._disposed) return;
    const { id, source } = event.currentTarget.dataset;
    const card = this.data.cards.find(item => item.id === id);
    // A late native binderror from an old URL must not invalidate its replacement.
    if (!card || !card.image || source !== card.image) return;
    this._cardAttempts = this._cardAttempts || new Map();
    if (!this._cardAttempts.has(id)) this._cardAttempts.set(id, 1);
    if (card.assetPath) require('../../utils/public-assets.js').invalidatePublicAsset(card.assetPath);
    else themeAssets.invalidateThemeAsset(card.artThemeId);
    if (this._cardImages) delete this._cardImages[id];
    if (this._hidden) {
      // Native images may finish after switching tabs. Forget the broken URL
      // without updating a hidden view, then resolve it again on the next show.
      this._hiddenCardFailures = this._hiddenCardFailures || new Set();
      this._hiddenCardFailures.add(id);
      return;
    }
    const cards = this.data.cards.map(card => card.id === id ? Object.assign({}, card, { image: '' }) : card);
    this.setData({ cards, filteredCards: this.data.category === 'all' ? cards : cards.filter(card => card.category === this.data.category) });
    this.markCardImageFailed(id);
    const generation = this._cardGeneration || 0;
    Promise.resolve().then(() => {
      if (!this._hidden && generation === (this._cardGeneration || 0)) this.loadCardImage(id);
    });
  },
  markCardImageFailed(id) {
    this._failedCardIds = this._failedCardIds || new Set();
    this._failedCardIds.add(id);
    if (!this.data.cardImagesFailed) this.setData({ cardImagesFailed: true });
  },
  cardImageLoaded(event) {
    if (this._hidden) return;
    const { id, source } = event.currentTarget.dataset;
    const card = this.data.cards.find(item => item.id === id);
    if (!card || !card.image || source !== card.image || !this._failedCardIds) return;
    this._failedCardIds.delete(id);
    if (!this._failedCardIds.size && this.data.cardImagesFailed) this.setData({ cardImagesFailed: false });
  },
  retryCardImages() {
    if (this._hidden) return;
    const ids = Array.from(this._failedCardIds || []);
    this._cardAttempts = this._cardAttempts || new Map();
    ids.forEach(id => {
      const card = this.data.cards.find(item => item.id === id);
      if (!card || card.image) return;
      if (this._cardPending && this._cardPending.has(id) || this._cardQueue && this._cardQueue.has(id)) return;
      this._cardAttempts.delete(id);
      this.loadCardImage(id);
    });
  },
  onHide() {
    this._hidden = true;
    this._cardGeneration = (this._cardGeneration || 0) + 1;
    this._cardFlushToken = (this._cardFlushToken || 0) + 1;
    this._cardFlushScheduled = false;
    this._cardQueue = new Set();
    // Requests from the hidden generation keep their own Set reference. A fast
    // return can therefore queue the same card immediately without the stale
    // request deleting the new generation's pending marker in finally().
    this._cardPending = new Set();
    this._themeAssetRequest = (this._themeAssetRequest || 0) + 1;
    this._shareRequest = (this._shareRequest || 0) + 1;
    if (this._shareTimer) clearTimeout(this._shareTimer);
    this._shareTimer = null;
    if (this._cardObserver) this._cardObserver.disconnect();
    this._cardObserver = null;
  },
  onUnload() { this._disposed = true; this.onHide(); },
  selectCategory(event) {
    const category = event.currentTarget.dataset.id;
    this.setData({
      category, filterOpen: false,
      filteredCards: category === 'all' ? this.data.cards : this.data.cards.filter(c => c.category === category)
    });
  },
  toggleFilters() { this.setData({ filterOpen: !this.data.filterOpen }); },
  testEntryUrl(card) {
    const id = encodeURIComponent(card.id);
    const pending = card.quickStart && require('../../utils/answer-drafts.js').hasPendingDraft(card.id);
    return card.quickStart && !pending ? `/pages/test-answer/index?id=${id}&context=ordinary` : `/pages/test-detail/index?id=${id}`;
  },
  openTest(event) {
    const card = this.data.cards.find(c => c.id === event.currentTarget.dataset.id);
    if (!card) return;
    const url = card.collected ?
      `/packages/reports/index?id=${card.id}&recordId=${encodeURIComponent(card.recordId)}` :
      this.testEntryUrl(card);
    wx.navigateTo({ url });
  },
  exploreNext() {
    if (this.data.recommendation) wx.navigateTo({ url: this.testEntryUrl(this.data.recommendation) });
    else this.openArchive();
  },
  exploreReward() {
    if (this.data.rewardReady) {
      if (this.data.recentExploration) this.openRecentReport(); else this.openArchive();
      return;
    }
    const card = this.data.cards.find(item => item.id === this.data.rewardTargetTestId && !item.collected);
    if (!card) { this.exploreNext(); return; }
    wx.navigateTo({ url: this.testEntryUrl(card) });
  },
  retakeRecent() {
    const recent = this.data.recentExploration;
    if (this._hidden || this._recentOpening || !recent) return;
    this._recentOpening = true;
    wx.navigateTo({ url: `/pages/test-detail/index?id=${encodeURIComponent(recent.testId)}`,
      fail: () => {
        this._recentOpening = false;
        if (!this._hidden) wx.showToast({ title: '暂时未能打开，请再试一次', icon: 'none' });
      } });
  },
  openRecentReport() {
    const recent = this.data.recentExploration;
    if (this._hidden || this._recentOpening || !recent) return;
    this._recentOpening = true;
    wx.navigateTo({ url: `/packages/reports/index?id=${encodeURIComponent(recent.testId)}&recordId=${encodeURIComponent(recent.recordId)}`,
      fail: () => {
        this._recentOpening = false;
        if (!this._hidden) wx.showToast({ title: '暂时未能打开，请再试一次', icon: 'none' });
      } });
  },
  openArchive() { wx.switchTab({ url: '/pages/user-center/index' }); },
  openTree() { wx.switchTab({ url: '/pages/my-tree/index' }); },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
  onShareAppMessage() {
    return {
      title: '人格测试树｜第一反应、MBTI、大五与九型人格测试',
      path: '/pages/test-hall/index', imageUrl: this.data.shareImagePath || DEFAULT_SHARE_IMAGE
    };
  }
});
