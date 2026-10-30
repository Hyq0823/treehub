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
const STICKER_CELLS = { sbti: [0, 0], mbti: [1, 0], enneagram: [2, 0], bigfive: [0, 1], shadow: [1, 1], ie: [2, 1] };

Page({
  data: {
    categories: display.categories, category: 'all', cards: [], filteredCards: [],
    tree: null, leaves: [], recommendation: null, error: '',
    themeId: 'adventurer', themeName: '柔软的冒险家', themeImage: ''
  },
  onLoad() { report(EVENTS.HALL_VIEW); },
  onShow() { this.loadTests(); },
  loadTests() {
    try {
      const state = archive.getArchive();
      const tree = getTree(state, catalog);
      let themeId = 'adventurer';
      try { themeId = themes.getState(state.records).selectedId || themeId; } catch (error) {}
      const theme = getTheme(themeId);
      const cards = catalog.map((test, index) => {
        const records = state.records.filter(r => r.testId === test.id);
        const latest = records[0];
        const metadata = display.tests[test.id] || {
          title: test.name, category: 'personality', prompt: test.description,
          symbol: '✦', art: 'facets', color: '#488d7a'
        };
        const stickerCell = STICKER_CELLS[test.id];
        let resultTitle = '';
        if (latest) {
          const resolved = resolveReport(test, latest);
          resultTitle = resolved ? resolved.title : '早期记录 · 可重新探索';
        }
        return Object.assign({}, metadata, {
          id: test.id, number: String(index + 1).padStart(2, '0'), questionsCount: test.questionsCount, time: test.time,
          count: records.length, collected: !!latest, recordId: latest && latest.id,
          hasSticker: !!stickerCell,
          stickerStyle: stickerCell ? `left:-${stickerCell[0] * 178 + 8}rpx;top:-${stickerCell[1] * 178 + 8}rpx;` : '',
          resultTitle
        });
      });
      const recommendation = cards.find(t => !t.collected) || null;
      this.setData({
        tree, cards, recommendation, error: '', themeId,
        themeName: theme && theme.name || '我的成长小世界',
        leaves: cards.slice(0, 8).map(card => ({ id: card.id, collected: card.collected })),
        moreLeafCount: Math.max(0, cards.length - 8),
        filteredCards: this.data.category === 'all' ? cards : cards.filter(c => c.category === this.data.category)
      });
      this.loadThemeImage(themeId);
    } catch (error) {
      this.setData({ error: '暂时无法读取本机档案。请重试，你的记录不会被自动覆盖。' });
    }
  },
  loadThemeImage(themeId) {
    const request = this._themeAssetRequest = (this._themeAssetRequest || 0) + 1;
    this.setData({ themeImage: '' });
    Promise.resolve(themeAssets.resolveThemeAsset(themeId)).then(url => {
      if (request === this._themeAssetRequest) this.setData({ themeImage: url || '' });
    }).catch(() => {});
  },
  themeImageFailed(event) {
    if (event.currentTarget.dataset.theme === this.data.themeId) this.setData({ themeImage: '' });
  },
  onUnload() { this._themeAssetRequest = (this._themeAssetRequest || 0) + 1; },
  selectCategory(event) {
    const category = event.currentTarget.dataset.id;
    this.setData({
      category,
      filteredCards: category === 'all' ? this.data.cards : this.data.cards.filter(c => c.category === category)
    });
  },
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
