const { report, EVENTS } = require('../../utils/track.js');
const archive = require('../../utils/archive.js');
const { getTree } = require('../../utils/personality-tree.js');
const display = require('../../data/exploration.js');
const themes = require('../../utils/themes.js');
const { getTheme } = require('../../data/themes.js');
const themeAssets = require('../../utils/theme-assets.js');
const { DEFAULT_SHARE_IMAGE, buildShareCard } = require('../../utils/share-card.js');
const { catalog, resolveResultTitle } = require('../../data/test-catalog.js');
const CARD_THEMES = { firstreaction: 'adventurer', mbti: 'adventurer', bigfive: 'collector', enneagram: 'romantic', ie: 'observer', sbti: 'dreamer', shadow: 'moon' };
const DISPLAY_ORDER = ['firstreaction', 'mbti', 'bigfive', 'enneagram', 'ie', 'sbti', 'shadow'];

function buildGreeting(uniqueCount) {
  const hour = new Date().getHours();
  const day = Math.floor(Date.now() / 86400000);
  if (!uniqueCount) return { lead: '你好，', title: '从一份好奇开始认识自己', note: '第一片探索叶，正在等你点亮。' };
  const moments = hour < 11 ? [
    ['早上好，', '今天想从哪里认识自己？', '带着清醒，也带着一点好奇出发。'],
    ['新的一天，', '先听听此刻真实的自己', '每次回答，都会留下新的年轮。']
  ] : hour < 18 ? [
    ['下午好，', '给自己两分钟慢下来', '看看今天的你，和上次有什么不同。'],
    ['见到你啦，', '来收集今天这一面的自己', '新的探索，也许会长出新的伙伴。']
  ] : [
    ['晚上好，', '把今天的感受留给自己', '慢慢回答，也是在认真照顾自己。'],
    ['欢迎回来，', '看看此刻的你变了吗？', '今晚的答案，会成为新的年轮。']
  ];
  const [lead, title, note] = moments[(day + uniqueCount) % moments.length];
  return { lead, title, note };
}

Page({
  data: {
    categories: display.categories, category: 'all', cards: [], filteredCards: [], filterOpen: false,
    tree: null, leaves: [], recommendation: null, error: '',
    themeId: 'adventurer', themeName: '柔软的冒险家', themeImage: '',
    themeColor: '#318aff', themePale: '#e9f5ff',
    artState: 'loading', rewardTitle: '', shareImagePath: DEFAULT_SHARE_IMAGE,
    greetingLead: '你好，', greetingTitle: '从一份好奇开始认识自己', greetingNote: '第一片探索叶，正在等你点亮。'
  },
  onLoad() { report(EVENTS.HALL_VIEW); },
  onShow() {
    this._hidden = false;
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
      try { themeId = themes.getState(state.records).selectedId || themeId; } catch (error) {}
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
          image: metadata.image || this._cardImages && this._cardImages[test.id] || '',
          localImage: metadata.image || '',
          resultTitle
        });
      });
      const recommendation = cards.find(t => !t.collected) || null;
      const greeting = buildGreeting(tree.uniqueCount);
      this.setData({
        tree, cards, recommendation, error: '', themeId,
        themeName: theme && theme.name || '我的成长小世界',
        themeColor: theme && theme.color || '#318aff', themePale: theme && theme.pale || '#e9f5ff',
        rewardTitle: !tree.uniqueCount ? '首测完成，领取树与伙伴' : tree.uniqueCount < 5 ? '再探索 1 项，让树长出新枝' : '你的极光，已经可以被发现',
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
    const card = this.data.cards.find(item => item.id === testId);
    if (!card || card.image) return;
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
    const cards = testIds.map(id => this.data.cards.find(item => item.id === id)).filter(card =>
      card && !card.image && !this._cardImages[card.id] && !pending.has(card.id));
    if (!cards.length) return;
    cards.forEach(card => pending.add(card.id));
    try {
      const themeIds = Array.from(new Set(cards.map(card => card.artThemeId)));
      const urls = await themeAssets.resolveThemeAssets(themeIds);
      if (this._hidden || generation !== (this._cardGeneration || 0)) return;
      let changed = false;
      cards.forEach(card => {
        const url = urls[card.artThemeId];
        if (!url) return;
        this._cardImages[card.id] = url;
        changed = true;
      });
      if (!changed) return;
      const next = this.data.cards.map(item => this._cardImages[item.id]
        ? Object.assign({}, item, { image: this._cardImages[item.id] }) : item);
      this.setData({ cards: next, filteredCards: this.data.category === 'all' ? next : next.filter(item => item.category === this.data.category) });
    } catch (error) {
      // A card can retry when it becomes visible again; the hall itself remains usable.
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
    const id = event.currentTarget.dataset.id;
    const card = this.data.cards.find(item => item.id === id);
    if (card) themeAssets.invalidateThemeAsset(card.artThemeId);
    if (this._cardImages) delete this._cardImages[id];
    const cards = this.data.cards.map(card => card.id === id ? Object.assign({}, card, { image: '', localImage: '' }) : card);
    this.setData({ cards, filteredCards: this.data.category === 'all' ? cards : cards.filter(card => card.category === this.data.category) });
    if (wx.nextTick) wx.nextTick(() => this.loadCardImage(id)); else this.loadCardImage(id);
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
  onUnload() { this.onHide(); },
  selectCategory(event) {
    const category = event.currentTarget.dataset.id;
    this.setData({
      category, filterOpen: false,
      filteredCards: category === 'all' ? this.data.cards : this.data.cards.filter(c => c.category === category)
    });
  },
  toggleFilters() { this.setData({ filterOpen: !this.data.filterOpen }); },
  openTest(event) {
    const card = this.data.cards.find(c => c.id === event.currentTarget.dataset.id);
    if (!card) return;
    const url = card.collected ?
      `/packages/reports/index?id=${card.id}&recordId=${encodeURIComponent(card.recordId)}` :
      card.quickStart ? `/pages/test-answer/index?id=${card.id}&context=ordinary` : `/pages/test-detail/index?id=${card.id}`;
    wx.navigateTo({ url });
  },
  exploreNext() {
    if (this.data.recommendation) wx.navigateTo({ url: this.data.recommendation.quickStart
      ? `/pages/test-answer/index?id=${this.data.recommendation.id}&context=ordinary`
      : `/pages/test-detail/index?id=${this.data.recommendation.id}` });
    else this.openArchive();
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
