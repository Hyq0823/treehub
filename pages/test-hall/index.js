const { report, EVENTS } = require('../../utils/track.js');
const archive = require('../../utils/archive.js');
const { getTree } = require('../../utils/personality-tree.js');
const { resolveReport } = require('../../utils/scoring.js');
const display = require('../../data/exploration.js');
const themes = require('../../utils/themes.js');
const { getTheme } = require('../../data/themes.js');
const themeAssets = require('../../utils/theme-assets.js');
const catalogModule = require('../../data/tests/index.js');
const catalog = catalogModule.default || catalogModule;
const CARD_THEMES = { mbti: 'adventurer', bigfive: 'collector', enneagram: 'romantic', ie: 'observer', sbti: 'dreamer', shadow: 'moon' };
const DISPLAY_ORDER = ['mbti', 'bigfive', 'enneagram', 'ie', 'sbti', 'shadow'];

Page({
  data: {
    categories: display.categories, category: 'all', cards: [], filteredCards: [], filterOpen: false,
    tree: null, leaves: [], recommendation: null, error: '',
    themeId: 'adventurer', themeName: '柔软的冒险家', themeImage: '',
    themeColor: '#318aff', themePale: '#e9f5ff',
    artState: 'loading', rewardTitle: ''
  },
  onLoad() { report(EVENTS.HALL_VIEW); },
  onShow() {
    this._hidden = false;
    require('../../utils/tab-bar.js').syncTabBar(this, '/pages/test-hall/index');
    this.loadTests();
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
      const cards = orderedCatalog.map((test, index) => {
        const records = state.records.filter(r => r.testId === test.id);
        const latest = records[0];
        const metadata = display.tests[test.id] || {
          title: test.name, category: 'personality', prompt: test.description,
          symbol: '✦', art: 'facets', color: '#488d7a'
        };
        let resultTitle = '';
        if (latest) {
          const resolved = resolveReport(test, latest);
          resultTitle = resolved ? resolved.title : '早期记录 · 可重新探索';
        }
        return Object.assign({}, metadata, {
          id: test.id, number: String(index + 1).padStart(2, '0'), questionsCount: test.questionsCount, time: test.time,
          count: records.length, collected: !!latest, recordId: latest && latest.id,
          artThemeId: CARD_THEMES[test.id] || 'adventurer',
          image: this._cardImages && this._cardImages[test.id] || '',
          resultTitle
        });
      });
      const recommendation = cards.find(t => !t.collected) || null;
      this.setData({
        tree, cards, recommendation, error: '', themeId,
        themeName: theme && theme.name || '我的成长小世界',
        themeColor: theme && theme.color || '#318aff', themePale: theme && theme.pale || '#e9f5ff',
        rewardTitle: !tree.uniqueCount ? '首测完成，领取树与伙伴' : tree.uniqueCount < 5 ? '再探索 1 项，让树长出新枝' : '你的极光，已经可以被发现',
        leaves: cards.slice(0, 8).map((card, index) => ({ id: card.id, collected: index < tree.uniqueCount })),
        moreLeafCount: Math.max(0, cards.length - 8),
        filteredCards: this.data.category === 'all' ? cards : cards.filter(c => c.category === this.data.category)
      });
      this.loadThemeImage(themeId);
      this.loadCardImages(cards);
    } catch (error) {
      this.setData({ error: '暂时无法读取本机档案。请重试，你的记录不会被自动覆盖。' });
    }
  },
  loadThemeImage(themeId) {
    const request = this._themeAssetRequest = (this._themeAssetRequest || 0) + 1;
    this.setData({ themeImage: '', artState: 'loading' });
    Promise.resolve(themeAssets.resolveThemeAsset(themeId)).then(url => {
      if (!this._hidden && request === this._themeAssetRequest) this.setData({ themeImage: url || '', artState: url ? 'ready' : 'unavailable' });
    }).catch(() => {
      if (!this._hidden && request === this._themeAssetRequest) this.setData({ artState: 'unavailable' });
    });
  },
  loadCardImages(cards) {
    const request = this._cardAssetRequest = (this._cardAssetRequest || 0) + 1;
    this._cardImages = this._cardImages || {};
    cards.forEach(card => {
      Promise.resolve(themeAssets.resolveThemeAsset(card.artThemeId)).then(url => {
        if (!url || this._hidden || request !== this._cardAssetRequest) return;
        this._cardImages[card.id] = url;
        const next = this.data.cards.map(item => item.id === card.id ? Object.assign({}, item, { image: url }) : item);
        this.setData({ cards: next, filteredCards: this.data.category === 'all' ? next : next.filter(item => item.category === this.data.category) });
      }).catch(() => {});
    });
  },
  retryThemeImage() { this.loadThemeImage(this.data.themeId); this.loadCardImages(this.data.cards); },
  themeImageFailed(event) {
    if (event.currentTarget.dataset.theme === this.data.themeId) this.setData({ themeImage: '', artState: 'unavailable' });
  },
  cardImageFailed(event) {
    const id = event.currentTarget.dataset.id;
    if (this._cardImages) delete this._cardImages[id];
    const cards = this.data.cards.map(card => card.id === id ? Object.assign({}, card, { image: '' }) : card);
    this.setData({ cards, filteredCards: this.data.category === 'all' ? cards : cards.filter(card => card.category === this.data.category) });
  },
  onHide() { this._hidden = true; this._themeAssetRequest = (this._themeAssetRequest || 0) + 1; this._cardAssetRequest = (this._cardAssetRequest || 0) + 1; },
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
      `/pages/test-detail/index?id=${card.id}`;
    wx.navigateTo({ url });
  },
  exploreNext() {
    if (this.data.recommendation) wx.navigateTo({ url: `/pages/test-detail/index?id=${this.data.recommendation.id}` });
    else this.openArchive();
  },
  openArchive() { wx.switchTab({ url: '/pages/user-center/index' }); },
  openTree() { wx.switchTab({ url: '/pages/my-tree/index' }); },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
  onShareAppMessage() { return { title: '人格测试树｜MBTI、大五与九型性格测试，收集独特的你', path: '/pages/test-hall/index' }; }
});
